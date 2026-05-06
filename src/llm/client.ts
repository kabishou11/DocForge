/**
 * LLM Client - 统一 LLM 客户端
 *
 * 根据 format 字段自动选择适配器：
 * - format: 'openai'     → OpenAI 兼容（ModelScope, DeepSeek, Moonshot 等）
 * - format: 'anthropic'  → Anthropic（Claude 系列）
 */

import { EventEmitter } from 'events';
import { createAdapter, type ModelAdapter, type AdapterConfig } from './adapters';
import type { ApiFormat, ModelConfig } from '../config';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
  format?: ApiFormat;
}

export interface ContentBlock {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentBlock[];
}

// Helper function to extract text from message content
export function extractText(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(block => block.type === 'text' && block.text)
    .map(block => block.text!)
    .join('');
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  enableThinking?: boolean;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface StreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      thinking?: string;
    };
    finish_reason?: string;
  }>;
}

/**
 * LLM 客户端核心类
 */
export class LLMClient extends EventEmitter {
  private config: LLMConfig;
  private baseUrl: string;
  private apiKey: string;
  private modelId: string;
  private format: ApiFormat;
  private adapter: ModelAdapter;

  constructor(config: LLMConfig, modelId?: string) {
    super();
    this.config = {
      timeout: 180000,
      maxRetries: 2,
      ...config
    };
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.format = config.format || 'openai';
    this.modelId = modelId || 'gpt-4o';

    this.adapter = this.buildAdapter();
  }

  /**
   * 从 ModelConfig 直接创建客户端
   */
  static fromModelConfig(modelConfig: ModelConfig, modelId?: string): LLMClient {
    return new LLMClient({
      format: modelConfig.format,
      baseUrl: modelConfig.baseUrl,
      apiKey: modelConfig.apiKey,
    }, modelId || modelConfig.model);
  }

  private buildAdapter(): ModelAdapter {
    const adapterConfig: AdapterConfig = {
      format: this.format,
      apiKey: this.apiKey,
      baseUrl: this.baseUrl,
      model: this.modelId,
      timeout: this.config.timeout,
    };
    return createAdapter(adapterConfig);
  }

  /**
   * 设置模型 ID（同时更新 adapter）
   */
  setModelId(modelId: string): void {
    this.modelId = modelId;
    this.adapter = this.buildAdapter();
  }

  /**
   * 更新完整配置并重建 adapter
   */
  updateConfig(config: Partial<LLMConfig>, modelId?: string): void {
    if (config.format !== undefined) this.format = config.format;
    if (config.baseUrl !== undefined) this.baseUrl = config.baseUrl.replace(/\/$/, '');
    if (config.apiKey !== undefined) this.apiKey = config.apiKey;
    if (modelId) this.modelId = modelId;
    this.config = { ...this.config, ...config };
    this.adapter = this.buildAdapter();
  }

  /**
   * 获取模型 ID
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * 发送聊天请求（非流式）
   *
   * 使用示例：
   * const response = await llm.chat({
   *   model: 'deepseek-ai/DeepSeek-V3.2',
   *   messages: [{ role: 'user', content: '9.9和9.11谁大' }],
   *   enableThinking: true
   * });
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const chatOptions = {
      ...options,
      model: options.model || this.modelId,
    };

    const maxRetries = this.config.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.adapter.chat(options.messages, chatOptions);
      } catch (error) {
        if (attempt === maxRetries) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    throw new Error('Max retries exceeded');
  }

  /**
   * 发送流式聊天请求
   *
   * 使用示例：
   * const stream = await llm.chatStream({
   *   model: 'deepseek-ai/DeepSeek-V3.2',
   *   messages: [{ role: 'user', content: '介绍无锡' }],
   *   enableThinking: true
   * });
   *
   * for await (const chunk of stream) {
   *   if (chunk.choices[0]?.delta.content) {
   *     process.stdout.write(chunk.choices[0].delta.content);
   *   }
   * }
   */
  async *chatStream(options: ChatOptions): AsyncGenerator<StreamChunk> {
    const chatOptions = {
      ...options,
      model: options.model || this.modelId,
    };

    yield* this.adapter.chatStream(options.messages, chatOptions);
  }

  /**
   * 便捷方法：生成文档大纲
   */
  async generateOutline(
    topic: string,
    description: string,
    styleVersion: string = 'v0.1'
  ): Promise<{
    sections: Array<{ id: string; title: string; level: number; summary: string }>;
    wordCount: string;
  }> {
    const prompt = `基于以下主题和描述，生成文档大纲。

主题：${topic}
描述：${description}
风格版本：${styleVersion}

请以 JSON 格式输出大纲，格式如下：
{
  "sections": [
    {"id": "sec-1", "title": "章节标题", "level": 1, "summary": "章节摘要"}
  ],
  "wordCount": "预估字数范围"
}`;

    const response = await this.chat({
      model: this.modelId,
      messages: [{ role: 'user', content: prompt }],
      enableThinking: false
    });

    const content = extractText(response.choices[0].message.content);
    // 尝试解析 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse outline JSON');
  }

  /**
   * 便捷方法：生成章节内容
   */
  async generateSection(
    section: { id: string; title: string; level: number; summary: string },
    topic: string,
    styleConstraints: Record<string, unknown>
  ): Promise<string> {
    const prompt = `基于以下信息生成章节内容：

主题：${topic}
章节信息：
- ID: ${section.id}
- 标题: ${section.title}
- 级别: ${section.level}
- 摘要: ${section.summary}

风格约束：${JSON.stringify(styleConstraints)}

请生成符合要求的章节内容，直接输出文本（不需要 JSON 包装）。`;

    const response = await this.chat({
      model: this.modelId,
      messages: [{ role: 'user', content: prompt }],
      enableThinking: true,
      temperature: 0.7
    });

    return extractText(response.choices[0].message.content);
  }

  /**
   * 生成完整文档
   */
  async generateDocument(
    topic: string,
    description: string,
    outline: { sections: Array<{ level: number; title: string; summary: string }>; wordCount: number | string }
  ): Promise<string> {
    const prompt = `请根据以下信息生成一篇完整的文档，使用 Markdown 格式。

文档主题：${topic}
文档描述：${description}
预估字数：${outline.wordCount}

文档大纲：
${outline.sections.map((s, i) => `${'#'.repeat(s.level)} ${s.title}\n${s.summary}`).join('\n\n')}

要求：
1. 使用 Markdown 格式输出
2. 遵循学术/专业文档风格
3. 每个章节要有充实的内容
4. 使用中文标点符号
5. 内容要详实、深入

请直接生成文档内容，无需额外说明。`;

    const response = await this.chat({
      model: this.modelId,
      messages: [{ role: 'user', content: prompt }],
      enableThinking: true,
      temperature: 0.7,
      maxTokens: 16384
    });

    return extractText(response.choices[0].message.content);
  }

  /**
   * 基于模板生成文档
   */
  async generateDocumentFromTemplate(
    templateContent: string,
    topic: string,
    description: string,
    stylePrompt?: string,
    wordCount?: number
  ): Promise<string> {
    // 取前 4000 字符作为风格参考，保留更多结构信息
    const truncatedTemplate = templateContent.length > 4000
      ? templateContent.slice(0, 4000) + '\n...（更多内容省略）'
      : templateContent;

    const targetWords = wordCount || 3000;

    let prompt = `你是一位专业的文档撰写专家。请严格按照以下参考文档的风格和结构，生成一篇新文档。

【参考文档（用于学习风格和结构）】
${truncatedTemplate}`;

    if (stylePrompt) {
      prompt += `\n\n${stylePrompt}`;
    }

    prompt += `

【新文档要求】
主题：${topic}
描述：${description || '无'}
目标字数：约 ${targetWords} 字

【严格要求】
1. 完全参考上方文档的标题层级结构（如：一、XXX；（一）XXX；1. XXX）
2. 保持相同的专业语气、行文风格和段落密度
3. 每个章节内容充实，不得出现空洞的标题
4. 使用中文标点符号（，。：；""等），不使用英文标点
5. 正文段落首行缩进两个字符
6. 字数要求：总字数控制在 ${targetWords} 字左右（±20%）
7. 输出纯 Markdown 格式，不要添加任何解释或说明
8. 不要在文档中提及"参考文档"或"根据模板"等字样

请直接输出文档内容：`;

    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.chat({
          model: this.modelId,
          messages: [{ role: 'user', content: prompt }],
          enableThinking: true,
          temperature: 0.7,
          maxTokens: 16384
        });

        return extractText(response.choices[0].message.content);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }

    throw lastError || new Error('生成文档失败');
  }

  /**
   * 从模板内容生成结构化大纲（用于分段生成）
   */
  async generateOutlineFromTemplate(
    templateContent: string,
    topic: string,
    description: string,
    targetWords: number = 3000
  ): Promise<{ sections: Array<{ title: string; level: number; keywords: string; targetWords: number }> }> {
    const truncated = templateContent.length > 3000
      ? templateContent.slice(0, 3000) + '\n...'
      : templateContent;

    const sectionCount = Math.max(5, Math.round(targetWords / 500));

    const prompt = `你是文档结构专家。分析参考文档的结构，为新主题生成大纲。

【参考文档结构】
${truncated}

【新文档】
主题：${topic}
描述：${description || '无'}
目标字数：${targetWords} 字
目标章节数：约 ${sectionCount} 个章节

请输出 JSON 格式大纲（不要输出其他内容）：
{
  "sections": [
    {"title": "章节标题", "level": 1, "keywords": "搜索关键词", "targetWords": 500}
  ]
}

要求：
- level 1 = 一级标题（##），level 2 = 二级标题（###）
- keywords 用于联网搜索该章节相关最新信息
- targetWords 各章节字数之和应约等于 ${targetWords}
- 参考原文档的标题层级和结构风格`;

    const response = await this.chat({
      model: this.modelId,
      messages: [{ role: 'user', content: prompt }],
      enableThinking: false,
      temperature: 0.5,
      maxTokens: 2048
    });

    const content = extractText(response.choices[0].message.content);
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('大纲解析失败');
  }

  /**
   * 流式生成单个章节内容
   */
  async streamSectionContent(
    options: {
      topic: string;
      sectionTitle: string;
      sectionLevel: number;
      targetWords: number;
      stylePrompt: string;
      previousContext: string;
      searchContext: string;
    },
    onChunk: (text: string) => void
  ): Promise<string> {
    const { topic, sectionTitle, sectionLevel, targetWords, stylePrompt, previousContext, searchContext } = options;

    const headingMark = '#'.repeat(sectionLevel + 1); // level 1 → ##, level 2 → ###

    let prompt = `你是专业文档撰写专家。请为以下文档撰写一个章节。

【文档主题】${topic}
【当前章节】${headingMark} ${sectionTitle}
【目标字数】约 ${targetWords} 字`;

    if (searchContext) {
      prompt += `\n\n${searchContext}`;
    }

    if (previousContext) {
      prompt += `\n\n【前文摘要（保持连贯性）】\n${previousContext}`;
    }

    prompt += `\n\n${stylePrompt}

【输出要求】
1. 直接输出该章节的 Markdown 内容（以 ${headingMark} ${sectionTitle} 开头）
2. 内容充实专业，每段不少于80字，至少3个段落
3. 适当使用列表、数据增强说服力
4. 使用中文标点，正文段落体现首行缩进
5. 不要输出任何解释，只输出章节内容`;

    let accumulated = '';

    const stream = this.chatStream({
      model: this.modelId,
      messages: [{ role: 'user', content: prompt }],
      enableThinking: true,
      temperature: 0.7,
      maxTokens: Math.max(4096, targetWords * 3)
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        accumulated += delta;
        onChunk(delta);
      }
    }

    return accumulated;
  }
}

/**
 * 创建默认 LLM 客户端（使用默认 ModelScope 预设）
 */
export function createLLMClient(apiKey?: string, modelId?: string): LLMClient {
  return new LLMClient({
    format: 'openai',
    baseUrl: process.env.LLM_BASE_URL || 'https://api-inference.modelscope.cn/v1',
    apiKey: apiKey || process.env.MODELSCOPE_API_KEY || '',
  }, modelId || 'deepseek-ai/DeepSeek-V3.2');
}

export default LLMClient;
