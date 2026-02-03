/**
 * LLM Client - ModelScope/OpenAI 兼容接口
 *
 * 对接 ModelScope 的 DeepSeek-V3.2 模型，支持流式输出和思考控制
 *
 * 使用示例：
 * const llm = new LLMClient({
 *   baseUrl: 'https://api-inference.modelscope.cn/v1',
 *   apiKey: process.env.MODELSCOPE_API_KEY
 * });
 *
 * const response = await llm.chat({
 *   model: 'deepseek-ai/DeepSeek-V3.2',
 *   messages: [{ role: 'user', content: '9.9和9.11谁大' }],
 *   enableThinking: true
 * });
 */

import { EventEmitter } from 'events';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  maxRetries?: number;
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

  constructor(config: LLMConfig, modelId: string = 'deepseek-ai/DeepSeek-V3.2') {
    super();
    this.config = {
      timeout: 180000, // 3 minutes timeout for large requests
      maxRetries: 2,
      ...config
    };
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.modelId = modelId;
  }

  /**
   * 设置模型 ID
   */
  setModelId(modelId: string): void {
    this.modelId = modelId;
  }

  /**
   * 获取模型 ID
   */
  getModelId(): string {
    return this.modelId;
  }

  /**
   * 发送聊天请求（非流式）
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`;

    const body = {
      model: options.model,
      messages: options.messages,
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      extra_body: {
        enable_thinking: options.enableThinking ?? false
      }
    };

    const response = await this.fetchWithRetry(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    return response.json() as Promise<ChatResponse>;
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
    const endpoint = `${this.baseUrl}/chat/completions`;

    const body = {
      model: options.model,
      messages: options.messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      extra_body: {
        enable_thinking: options.enableThinking ?? true
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const chunk = JSON.parse(data);
            yield chunk as StreamChunk;
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }

  /**
   * 带重试的 fetch
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries?: number
  ): Promise<Response> {
    const maxRetries = retries ?? this.config.maxRetries ?? 2;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const controller = new AbortController();
        // 使用更长的超时时间
        const timeout = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (response.ok) {
          return response;
        }

        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
      } catch (error) {
        // 如果是 abort (超时) 错误，直接抛出，不重试
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`请求超时 (${this.config.timeout}ms)，请稍后重试`);
        }
        if (i === maxRetries) {
          throw error;
        }
        // 指数退避
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }

    throw new Error('Max retries exceeded');
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
    stylePrompt?: string
  ): Promise<string> {
    // 截取模板的关键部分（标题结构和部分内容示例）
    // 只取前 2000 字符，减少请求大小
    const truncatedTemplate = templateContent.length > 2000
      ? templateContent.slice(0, 2000) + '\n...（更多内容省略）'
      : templateContent;

    let prompt = `请按照以下参考文档的风格，生成一篇新文档。

【参考文档风格摘要】
${truncatedTemplate}`;

    // 添加额外的样式提示
    if (stylePrompt) {
      prompt += `\n\n${stylePrompt}`;
    }

    prompt += `

【新文档要求】
主题：${topic}
描述：${description}

要求：
1. 参考文档的标题层级结构（如：一、XXX；二、XXX；3.1 XXX；3.2 XXX）
2. 参考文档的专业语气和格式
3. 使用中文标点符号（，。：；""等）
4. 内容要详实、深入、专业
5. 生成完整的可直接使用的文档

请直接生成文档内容，无需提及"参考文档"。`;

    let lastError: Error | null = null;
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.chat({
          model: this.modelId,
          messages: [{ role: 'user', content: prompt }],
          enableThinking: true,
          temperature: 0.7,
          maxTokens: 8192
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
}

/**
 * 创建默认 LLM 客户端
 */
export function createLLMClient(apiKey?: string, modelId?: string): LLMClient {
  return new LLMClient({
    baseUrl: process.env.LLM_BASE_URL || 'https://api-inference.modelscope.cn/v1',
    apiKey: apiKey || process.env.MODELSCOPE_API_KEY || ''
  }, modelId);
}

export default LLMClient;
