/**
 * DocForge TUI 控制器
 */

import { EventEmitter } from "events";
import { Message } from "./types";
import { ModelScopeService } from "../services/modelscope";
import { LLMClient, extractText } from "../llm/client";
import { ConfigManager, type ModelConfig, type PresetName, PRESETS } from "../config";
import { ModelInfo } from "../types";
import * as fs from "fs";
import * as path from "path";
import * as mammoth from "mammoth";
import {
  extractStylesFromDocx,
  generateDocxWithPython,
  getDefaultStyleRules,
  PythonStyleRules
} from "../services/python-docx";
import { StyleExtractor, StyleRules } from "../services/document-synthesizer";
import { searchWeb, formatSearchContext } from "../services/web-search";
import { buildTimestampedDocumentStem } from "../utils/path-safety";

export interface GenerationProgress {
  step: string;
  model?: string;
  status: 'started' | 'completed' | 'error';
  message?: string;
  // 新增：分段生成进度
  sectionIndex?: number;
  sectionTotal?: number;
  sectionTitle?: string;
  wordCount?: number;
  targetWords?: number;
  streamChunk?: string;  // 流式输出的文本片段
  searchQuery?: string;  // 正在搜索的关键词
  searchResults?: number; // 搜索结果数量
}

export interface GenerateOptions {
  onProgress?: (progress: GenerationProgress) => void;
  wordCount?: number;
  enableSearch?: boolean;  // 是否启用联网搜索
  signal?: AbortSignal;
}

export interface ControllerOptions {
  apiKey?: string;
}

/**
 * TUI 控制器
 */
export class TuiController extends EventEmitter {
  private llmClient: LLMClient;
  private modelService: ModelScopeService;
  private configManager: ConfigManager;
  private llmModels: ModelInfo[] = [];
  private ocrModels: ModelInfo[] = [];
  private selectedOCR: { id: string; name: string } = { id: '', name: '' };
  private messages: Message[] = [];

  constructor(options?: ControllerOptions) {
    super();

    // 初始化配置
    this.configManager = new ConfigManager();
    if (options?.apiKey) {
      this.configManager.setApiKey(options.apiKey);
    }

    // 根据配置创建 LLM 客户端
    this.llmClient = this.createLLMClient();

    // 初始化服务
    this.modelService = new ModelScopeService(this.configManager);

    // 加载模型
    this.loadModels();
  }

  /**
   * 根据当前配置创建 LLM 客户端
   */
  private createLLMClient(): LLMClient {
    const config = this.configManager.getModelConfig();
    return LLMClient.fromModelConfig(config);
  }

  private async loadModels(): Promise<void> {
    try {
      this.llmModels = await this.modelService.listLLMModels();
      this.ocrModels = await this.modelService.listOCRModels();

      // 加载本地 OCR 模型
      this.loadLocalOCRModels();
    } catch (error) {
      console.error("加载模型列表失败:", error);
    }
  }

  /**
   * 加载本地 OCR 模型
   */
  private loadLocalOCRModels(): void {
    const localModelsPath = './models';
    if (!fs.existsSync(localModelsPath)) {
      return;
    }

    const entries = fs.readdirSync(localModelsPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const configPath = path.join(localModelsPath, entry.name, 'config.json');
        if (fs.existsSync(configPath)) {
          try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            // 检查是否已经存在
            if (!this.ocrModels.find(m => m.id === config.modelId)) {
              this.ocrModels.push({
                id: config.modelId,
                name: config.name,
                type: 'ocr',
                description: config.description || '本地 OCR 模型',
                provider: 'local',
                localPath: path.join(localModelsPath, entry.name)
              });
            }
          } catch {
            // 忽略解析错误的配置
          }
        }
      }
    }
  }

  /**
   * 获取当前模型配置（简化版）
   */
  getModelConfig(): ModelConfig & { hasApiKey: boolean; ocr: string } {
    const config = this.configManager.getModelConfig();
    const ocr = this.getSelectedOCR();
    return {
      ...config,
      apiKey: config.apiKey ? '***' : '',  // 隐藏 apiKey
      hasApiKey: !!config.apiKey,
      ocr: ocr.name || '默认样式',
    };
  }

  /**
   * 更新模型配置（部分更新）
   */
  updateModelConfig(updates: Partial<ModelConfig>): void {
    this.configManager.updateModelConfig(updates);
    this.llmClient = this.createLLMClient();
  }

  /**
   * 应用预设配置
   */
  applyPreset(presetName: string): void {
    this.configManager.applyPreset(presetName as PresetName);
    this.llmClient = this.createLLMClient();
  }

  /**
   * 获取所有预设列表
   */
  getPresets(): Record<string, { format: string; baseUrl: string; model: string }> {
    return PRESETS;
  }

  /**
   * 获取消息历史
   */
  getMessages(): Message[] {
    return this.messages;
  }

  /**
   * 添加用户消息
   */
  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  /**
   * 添加助手消息
   */
  addAssistantMessage(content: string): void {
    this.messages.push({ role: "assistant", content });
  }

  /**
   * 添加系统消息
   */
  addSystemMessage(content: string): void {
    this.messages.push({ role: "system", content });
  }

  /**
   * 清空消息
   */
  clearMessages(): void {
    this.messages = [];
  }

  /**
   * 处理命令
   */
  async handleCommand(command: string): Promise<string | null> {
    switch (command) {
      case "new":
        if (!this.modelService.isConfigured()) {
          return "请先配置 API Key。输入 /模型 进行配置。";
        }
        return "从零开始生成文档\n\n请描述您要生成的文档内容...";

      case "template":
        if (!this.modelService.isConfigured()) {
          return "请先配置 API Key。输入 /模型 进行配置。";
        }
        return "基于模板生成\n\n请将参考文档放到 templates 目录下...";

      case "model":
        return "SHOW_MODEL_CONFIG";

      case "settings":
        return `项目设置:
1. 模板目录: ./templates
2. 输出目录: ./output
3. 配置位置: ~/.config/docforge/`;

      case "help":
        return `帮助:
  /0-1      从零开始生成
  /模板     基于模板生成
  /模型     模型配置
  /列表     显示模型列表
  /测试     测试连接
  /设置     项目设置
  /帮助     显示帮助
  /退出     退出

快捷键:
  / 或 Ctrl+P  命令菜单
  Ctrl+C       退出`;

      case "exit":
        process.exit(0);
        return null;

      default:
        return `未知命令: ${command}`;
    }
  }

  /**
   * 处理模型配置操作
   */
  async handleModelAction(action: string): Promise<{ type: string; data?: any }> {
    switch (action) {
      case "api-key":
        return { type: "api-key-input" };
      case "llm":
        return {
          type: "model-select",
          data: {
            models: this.llmModels.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description || "",
            })),
            title: "选择 LLM 模型",
          },
        };
      case "test":
        return { type: "test-connection" };
      default:
        return { type: "unknown", data: action };
    }
  }

  /**
   * 设置 API Key
   */
  setApiKey(key: string): boolean {
    if (key.length < 10) {
      return false;
    }
    this.configManager.setApiKey(key);
    this.llmClient = this.createLLMClient();
    return true;
  }

  /**
   * 设置 LLM 模型
   */
  setLLM(modelId: string): boolean {
    const model = this.llmModels.find((m) => m.id === modelId);
    if (model) {
      this.modelService.setLLM(model.id, model.name);
      this.configManager.updateModelConfig({ model: model.id });
      this.llmClient = this.createLLMClient();
      return true;
    }
    return false;
  }

  /**
   * 设置 OCR 模型
   */
  setOCR(modelId: string): boolean {
    const model = this.ocrModels.find((m) => m.id === modelId);
    if (model) {
      this.selectedOCR = { id: model.id, name: model.name };
      this.configManager.setOCR(model.id, model.name);
      return true;
    }
    return false;
  }

  /**
   * 获取当前选中的 OCR 模型
   */
  getSelectedOCR(): { id: string; name: string } {
    if (this.selectedOCR && this.selectedOCR.id) {
      return this.selectedOCR;
    }
    // 从配置加载
    try {
      const ocr = this.configManager.getOCR();
      if (ocr && ocr.id) {
        this.selectedOCR = ocr;
        return ocr;
      }
    } catch {
      // 忽略错误
    }
    return { id: '', name: '' };
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<{ success: boolean; message: string; time?: number }> {
    const start = Date.now();
    try {
      const result = await this.llmClient.testConnection();
      return {
        success: result.success,
        message: result.message,
        time: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        time: Date.now() - start,
      };
    }
  }

  /**
   * 处理聊天消息
   */
  async processChat(input: string): Promise<string> {
    if (!this.modelService.isConfigured()) {
      return "请先配置 API Key。输入 /模型 进行配置。";
    }

    this.messages.push({ role: "user", content: input });

    try {
      const llmConfig = this.modelService.getSelectedLLM();
      const allMessages: Message[] = [
        { role: "system", content: "你是一个专业的文档撰写助手。" },
        ...this.messages,
      ];

      const response = await this.llmClient.chat({
        model: llmConfig.id,
        messages: allMessages as any,
        enableThinking: true,
      });

      const content = extractText(response.choices[0].message.content);
      this.messages.push({ role: "assistant", content });
      return content;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return `生成失败: ${errorMsg}`;
    }
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return this.modelService.isConfigured();
  }

  /**
   * 获取 LLM 模型列表
   */
  getLLMModels(): ModelInfo[] {
    return this.llmModels;
  }

  /**
   * 获取 OCR 模型列表
   */
  getOCRModels(): ModelInfo[] {
    return this.ocrModels;
  }

  /**
   * 获取所有模型列表
   */
  getAllModels(): { llm: ModelInfo[]; ocr: ModelInfo[] } {
    return {
      llm: this.llmModels,
      ocr: this.ocrModels
    };
  }

  /**
   * 生成文档大纲
   */
  async generateOutline(topic: string, description: string, signal?: AbortSignal): Promise<{
    sections: Array<{ level: number; title: string; summary: string }>;
    wordCount: number;
  }> {
    try {
      const response = await this.llmClient.generateOutline(topic, description, 'v0.1', signal);
      return {
        sections: response.sections.map(s => ({
          level: s.level,
          title: s.title,
          summary: s.summary
        })),
        wordCount: parseInt(response.wordCount.replace(/\D/g, "")) || 3000,
      };
    } catch (error) {
      throw new Error(`生成大纲失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 生成完整文档
   */
  async generateDocument(
    topic: string,
    description: string,
    outline: { sections: Array<{ level: number; title: string; summary: string }>; wordCount: number },
    signal?: AbortSignal
  ): Promise<{
    filePath: string;
    docxPath: string;
    sectionCount: number;
    wordCount: number;
  }> {
    try {
      // 生成文档内容
      const content = await this.llmClient.generateDocument(topic, description, outline, signal);

      const { filePath, docxPath } = await this.persistDocumentOutputs(
        topic,
        content,
        getDefaultStyleRules(),
        'from_scratch'
      );

      // 统计字数
      const wordCount = content.length;

      return {
        filePath,
        docxPath,
        sectionCount: outline.sections.length,
        wordCount,
      };
    } catch (error) {
      throw new Error(`生成文档失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 基于模板生成文档 - 分段生成流程
   * 模板解析 → 大纲生成 → [联网搜索 → 流式生成] × N → 合并 → DOCX
   */
  async generateDocumentFromTemplate(
    templatePath: string,
    topic: string,
    description: string,
    options?: GenerateOptions
  ): Promise<{
    filePath: string;
    docxPath: string;
    sectionCount: number;
    wordCount: number;
    modelsUsed: {
      ocr: string | null;
      vl: string | null;
      llm: string;
    };
    styleRules?: StyleRules;
  }> {
    const report = (step: string, status: GenerationProgress['status'], extra?: Partial<GenerationProgress>) => {
      options?.onProgress?.({ step, status, ...extra });
    };

    try {
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }

      const ext = path.extname(templatePath).toLowerCase();
      const fileName = path.basename(templatePath);
      const llmConfig = this.configManager.getLLM();
      const ocrConfig = this.configManager.getOCR();
      const targetWords = options?.wordCount || 3000;
      const enableSearch = options?.enableSearch !== false; // 默认开启
      const signal = options?.signal;

      let templateContent: string;
      let styleRules: StyleRules;

      // ========== 阶段 1: 模板解析 ==========
      report('template_parse', 'started', { message: `解析模板: ${fileName}` });

      if (ext === '.docx') {
        styleRules = await StyleExtractor.extractFromDocx(templatePath);
        const buffer = fs.readFileSync(templatePath);
        const textResult = await mammoth.extractRawText({ buffer });
        templateContent = textResult.value;
      } else {
        styleRules = await StyleExtractor.extractFromDocx(templatePath);
        templateContent = fs.readFileSync(templatePath, "utf-8");
      }

      report('template_parse', 'completed', {
        message: `标题${styleRules.heading1.fontFamily}${styleRules.heading1.fontSize}pt, 正文${styleRules.body.fontFamily}${styleRules.body.fontSize}pt`
      });

      // ========== 阶段 2: 生成大纲 ==========
      report('outline', 'started', { message: '分析模板结构，生成大纲...' });

      const outline = await this.llmClient.generateOutlineFromTemplate(
        templateContent, topic, description, targetWords, signal
      );

      const sections = outline.sections;
      report('outline', 'completed', {
        message: `${sections.length} 个章节`,
        sectionTotal: sections.length
      });

      // ========== 阶段 3: 逐章节生成 ==========
      const stylePrompt = this.buildStylePrompt(styleRules);
      const allSections: string[] = [];
      let totalWords = 0;

      // 生成文档标题
      allSections.push(`# ${topic}\n`);

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];

        // 3a. 联网搜索
        let searchContext = '';
        if (enableSearch && section.keywords) {
          report('section_search', 'started', {
            sectionIndex: i,
            sectionTotal: sections.length,
            sectionTitle: section.title,
            searchQuery: section.keywords
          });

          const results = await searchWeb(`${section.keywords} ${topic}`, 3, signal);
          searchContext = formatSearchContext(results);

          report('section_search', 'completed', {
            sectionIndex: i,
            sectionTitle: section.title,
            searchResults: results.length,
            message: results.length > 0 ? `${results.length} 条参考` : '无结果'
          });
        }

        // 3b. 流式生成章节
        report('section_generate', 'started', {
          sectionIndex: i,
          sectionTotal: sections.length,
          sectionTitle: section.title,
          wordCount: totalWords,
          targetWords
        });

        // 前文摘要（取最后 500 字作为上下文）
        const prevText = allSections.join('\n');
        const previousContext = prevText.length > 500
          ? prevText.slice(-500)
          : prevText;

        const sectionContent = await this.llmClient.streamSectionContent(
          {
            topic,
            sectionTitle: section.title,
            sectionLevel: section.level,
            targetWords: section.targetWords || Math.round(targetWords / sections.length),
            stylePrompt,
            previousContext,
            searchContext,
            signal
          },
          (chunk) => {
            totalWords += chunk.length;
            report('section_stream', 'started', {
              sectionIndex: i,
              sectionTotal: sections.length,
              sectionTitle: section.title,
              wordCount: totalWords,
              targetWords,
              streamChunk: chunk
            });
          }
        );

        allSections.push(sectionContent);

        report('section_generate', 'completed', {
          sectionIndex: i,
          sectionTotal: sections.length,
          sectionTitle: section.title,
          wordCount: totalWords,
          targetWords,
          message: `${sectionContent.length} 字`
        });
      }

      // ========== 阶段 4: 合并 + 生成 DOCX ==========
      report('docx_generate', 'started', { message: '合并内容，生成 DOCX...' });

      const fullContent = allSections.join('\n\n');
      const pythonStyleRules = this.convertToPythonStyle(styleRules);
      const { filePath: mdPath, docxPath } = await this.persistDocumentOutputs(
        topic,
        fullContent,
        pythonStyleRules,
        'from_template'
      );

      report('docx_generate', 'completed', {
        message: path.basename(docxPath),
        wordCount: fullContent.length
      });

      return {
        filePath: mdPath,
        docxPath,
        sectionCount: sections.length,
        wordCount: fullContent.length,
        modelsUsed: {
          ocr: ext === '.docx' ? ocrConfig.id : null,
          vl: null,
          llm: llmConfig.name
        },
        styleRules
      };
    } catch (error) {
      report('error', 'error', { message: error instanceof Error ? error.message : String(error) });
      throw new Error(`生成失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 保存 Markdown 预览和 DOCX 成品
   */
  private async persistDocumentOutputs(
    topic: string,
    markdown: string,
    styleRules: PythonStyleRules,
    outputKind: 'from_scratch' | 'from_template'
  ): Promise<{ filePath: string; docxPath: string }> {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const baseStem = buildTimestampedDocumentStem(topic, outputKind);
    const filePath = path.join(outputDir, `${baseStem}.md`);
    const docxPath = path.join(outputDir, `${baseStem}.docx`);

    fs.writeFileSync(filePath, markdown, 'utf-8');

    await generateDocxWithPython({
      markdown,
      outputPath: docxPath,
      styleRules,
      addTimestamp: true
    });

    return { filePath, docxPath };
  }

  /**
   * 构建样式提示词
   */
  private buildStylePrompt(styleRules: StyleRules): string {
    const s = styleRules;
    const h1Font = s.heading1.fontFamily || '黑体';
    const h2Font = s.heading2.fontFamily || '楷体';
    const bodyFont = s.body.fontFamily || '宋体';
    const bodySize = s.body.fontSize || 12;

    return `
【文档格式规范（必须严格遵守）】

1. Markdown 标题层级：
   - 文档主标题：# 标题（居中，${h1Font}，${s.title.fontSize || 22}pt，加粗）
   - 一级标题：## 标题（${h1Font}，${s.heading1.fontSize || 16}pt，加粗）
   - 二级标题：### 标题（${h2Font}，${s.heading2.fontSize || 14}pt，加粗）
   - 三级标题：#### 标题（${bodyFont}，${s.heading3.fontSize || 12}pt，加粗）

2. 正文格式：
   - 字体：${bodyFont}，${bodySize}pt
   - 对齐：${s.body.alignment === 'justify' ? '两端对齐' : '左对齐'}
   - 行距：${s.body.lineSpacing || 1.5}倍
   - 每段首行缩进两个汉字（在正文中体现）

3. 内容质量要求：
   - 每个章节至少包含 2-3 个段落，每段不少于 100 字
   - 禁止出现空洞的标题后无内容的情况
   - 专业术语准确，逻辑清晰，层次分明
   - 适当使用列表、表格增强可读性

4. 输出格式：
   - 纯 Markdown 格式
   - 不要输出任何解释、说明或元信息
   - 不要使用代码块包裹整个文档`;
  }

  /**
   * 获取项目设置
   */
  getSettings(): string {
    return `项目设置:
  模板目录: ./templates
  输出目录: ./output
  配置位置: ~/.config/docforge/`;
  }

  /**
   * 将 StyleRules 转换为 Python 样式格式
   */
  private convertToPythonStyle(rules: any): PythonStyleRules {
    // StyleRules 中的间距值是 twips（1pt = 20 twips），需转换为 pt 传给 Python
    const twipsToPt = (twips: number) => Math.round(twips / 20);
    // twips 转英寸（用于缩进）
    const twipsToInch = (twips: number) => Math.round(twips / 1440 * 100) / 100;

    return {
      title: {
        font: {
          name: rules.title?.fontFamily || '黑体',
          size: rules.title?.fontSize || 22,
          bold: rules.title?.fontBold !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.title?.alignment),
          space_before: twipsToPt(rules.title?.spaceBefore || 240),
          space_after: twipsToPt(rules.title?.spaceAfter || 120)
        }
      },
      heading1: {
        font: {
          name: rules.heading1?.fontFamily || '黑体',
          size: rules.heading1?.fontSize || 16,
          bold: rules.heading1?.fontBold !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.heading1?.alignment),
          space_before: twipsToPt(rules.heading1?.spaceBefore || 240),
          space_after: twipsToPt(rules.heading1?.spaceAfter || 120)
        }
      },
      heading2: {
        font: {
          name: rules.heading2?.fontFamily || '楷体',
          size: rules.heading2?.fontSize || 14,
          bold: rules.heading2?.fontBold !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.heading2?.alignment),
          space_before: twipsToPt(rules.heading2?.spaceBefore || 200),
          space_after: twipsToPt(rules.heading2?.spaceAfter || 80)
        }
      },
      heading3: {
        font: {
          name: rules.heading3?.fontFamily || '宋体',
          size: rules.heading3?.fontSize || 12,
          bold: rules.heading3?.fontBold !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.heading3?.alignment),
          space_before: twipsToPt(rules.heading3?.spaceBefore || 160),
          space_after: twipsToPt(rules.heading3?.spaceAfter || 60)
        }
      },
      body: {
        font: {
          name: rules.body?.fontFamily || '宋体',
          size: rules.body?.fontSize || 12,
          bold: rules.body?.fontBold || false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.body?.alignment),
          line_spacing: rules.body?.lineSpacing || 1.5,
          space_before: twipsToPt(rules.body?.spaceBefore || 0),
          space_after: twipsToPt(rules.body?.spaceAfter || 60),
          indent_first_line: rules.body?.indent ? twipsToInch(rules.body.indent) : 0.33
        }
      },
      list: {
        font: {
          name: rules.list?.fontFamily || '宋体',
          size: rules.list?.fontSize || 12,
          bold: rules.list?.fontBold || false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.list?.alignment),
          space_before: twipsToPt(rules.list?.spaceBefore || 40),
          space_after: twipsToPt(rules.list?.spaceAfter || 40)
        }
      },
      quote: {
        font: {
          name: rules.quote?.fontFamily || '楷体',
          size: rules.quote?.fontSize || 12,
          italic: rules.quote?.fontItalic !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.quote?.alignment),
          indent_left: rules.quote?.indent ? twipsToInch(rules.quote.indent) : 0.4,
          space_before: twipsToPt(rules.quote?.spaceBefore || 80),
          space_after: twipsToPt(rules.quote?.spaceAfter || 80)
        }
      },
      code: {
        font: {
          name: rules.code?.fontFamily || 'Consolas',
          size: rules.code?.fontSize || 11
        },
        paragraph: {
          alignment: this.mapAlignment(rules.code?.alignment),
          indent_left: rules.code?.indent ? twipsToInch(rules.code.indent) : 0.4,
          space_before: twipsToPt(rules.code?.spaceBefore || 120),
          space_after: twipsToPt(rules.code?.spaceAfter || 120)
        }
      },
      page_margin: {
        top: rules.pageMargin?.top ? rules.pageMargin.top / 1440 : 1.0,
        bottom: rules.pageMargin?.bottom ? rules.pageMargin.bottom / 1440 : 1.0,
        left: rules.pageMargin?.left ? rules.pageMargin.left / 1440 : 1.25,
        right: rules.pageMargin?.right ? rules.pageMargin.right / 1440 : 1.25
      }
    };
  }

  /**
   * 映射对齐方式
   */
  private mapAlignment(alignment?: string): string {
    switch (alignment) {
      case 'center': return 'center';
      case 'right': return 'right';
      case 'justify':
      case 'distribute': return 'justify';
      default: return 'left';
    }
  }
}

export default TuiController;
