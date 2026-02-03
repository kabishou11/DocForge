/**
 * DocForge TUI 控制器
 */

import { EventEmitter } from "events";
import { Message } from "./types";
import { ModelScopeService } from "../services/modelscope";
import { LLMClient, createLLMClient, extractText } from "../llm/client";
import { ConfigManager } from "../config";
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

export interface GenerationProgress {
  step: string;
  model?: string;
  status: 'started' | 'completed' | 'error';
  message?: string;
}

export interface GenerateOptions {
  onProgress?: (progress: GenerationProgress) => void;
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

    // 初始化服务
    this.llmClient = createLLMClient(
      this.configManager.getApiKey(),
      this.configManager.getLLM().id
    );
    this.modelService = new ModelScopeService(this.configManager);

    // 加载模型
    this.loadModels();
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
   * 获取模型配置信息
   */
  getModelConfig(): { provider: string; hasApiKey: boolean; llm: string; ocr: string } {
    const config = this.modelService.getConfigInfo();
    const ocr = this.getSelectedOCR();
    return {
      provider: config.provider,
      hasApiKey: config.hasApiKey,
      llm: config.llm.name,
      ocr: ocr.name || '默认样式',
    };
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
    this.llmClient = createLLMClient(
      this.configManager.getApiKey(),
      this.configManager.getLLM().id
    );
    return true;
  }

  /**
   * 设置 LLM 模型
   */
  setLLM(modelId: string): boolean {
    const model = this.llmModels.find((m) => m.id === modelId);
    if (model) {
      this.modelService.setLLM(model.id, model.name);
      this.llmClient.setModelId(model.id);
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
      const result = await this.modelService.testLLM();
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
  async generateOutline(topic: string, description: string): Promise<{
    sections: Array<{ level: number; title: string; summary: string }>;
    wordCount: number;
  }> {
    try {
      const response = await this.llmClient.generateOutline(topic, description);
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
    outline: { sections: Array<{ level: number; title: string; summary: string }>; wordCount: number }
  ): Promise<{
    filePath: string;
    sectionCount: number;
    wordCount: number;
  }> {
    try {
      // 生成文档内容
      const content = await this.llmClient.generateDocument(topic, description, outline);

      // 确保输出目录存在
      const outputDir = "./output";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 30);
      const filePath = path.join(outputDir, `${timestamp}_${safeTopic}.md`);

      // 保存文件
      fs.writeFileSync(filePath, content, "utf-8");

      // 统计字数
      const wordCount = content.length;

      return {
        filePath,
        sectionCount: outline.sections.length,
        wordCount,
      };
    } catch (error) {
      throw new Error(`生成文档失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 基于模板生成文档 - 简化流程（OCR 提取样式 → LLM 生成内容 → 文档合成）
   */
  async generateDocumentFromTemplate(
    templatePath: string,
    topic: string,
    description: string,
    options?: GenerateOptions
  ): Promise<{
    filePath: string;
    docxPath?: string;
    sectionCount: number;
    wordCount: number;
    modelsUsed: {
      ocr: string | null;
      vl: string | null;
      llm: string;
    };
    styleRules?: StyleRules;
  }> {
    // 进度回调辅助函数
    const reportProgress = (step: string, model: string | undefined, status: GenerationProgress['status'], message?: string) => {
      options?.onProgress?.({ step, model, status, message });
    };

    try {
      // 读取模板内容
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }

      const ext = path.extname(templatePath).toLowerCase();
      const fileName = path.basename(templatePath);

      // 获取当前配置的模型
      const llmConfig = this.configManager.getLLM();
      const ocrConfig = this.configManager.getOCR();

      let templateContent: string;
      let styleRules: StyleRules;

      // ========== 步骤 1: OCR 提取样式和内容 ==========
      reportProgress('ocr_extraction', ocrConfig.id, 'started', `正在解析模板: ${fileName}`);

      if (ext === '.docx') {
        // 使用 StyleExtractor 从 DOCX 提取样式规则
        styleRules = await StyleExtractor.extractFromDocx(templatePath);

        // 提取纯文本用于 LLM
        const buffer = fs.readFileSync(templatePath);
        const textResult = await mammoth.extractRawText({ buffer });
        templateContent = textResult.value;

        reportProgress('ocr_extraction', ocrConfig.id, 'completed',
          `样式提取完成 - 标题${styleRules.heading1.fontFamily}${styleRules.heading1.fontSize}pt, 正文${styleRules.body.fontFamily}${styleRules.body.fontSize}pt`);
      } else if (ext === '.md' || ext === '.txt') {
        // Markdown 模板: 使用默认样式
        styleRules = await StyleExtractor.extractFromDocx(templatePath);
        reportProgress('ocr_extraction', undefined, 'completed', '使用默认中文正式文档样式');
        templateContent = fs.readFileSync(templatePath, "utf-8");
      } else {
        throw new Error(`不支持的文件格式: ${ext}`);
      }

      reportProgress('ocr_extraction', ocrConfig.id, 'completed', `模板解析完成，${templateContent.length} 字符`);

      // ========== 步骤 2: LLM 生成内容 ==========
      reportProgress('content_generation', llmConfig.name, 'started', '基于模板风格生成新文档...');

      // 构建提示词，包含样式规范
      const stylePrompt = this.buildStylePrompt(styleRules);

      const content = await this.llmClient.generateDocumentFromTemplate(
        templateContent,
        topic,
        description,
        stylePrompt
      );

      reportProgress('content_generation', llmConfig.name, 'completed', `内容生成完成，约 ${content.length} 字符`);

      // ========== 步骤 3: 文档合成（使用 Python python-docx） ==========
      reportProgress('document_synthesis', ocrConfig.id, 'started', '正在应用模板样式...');

      const outputDir = "./output";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 30);
      const basePath = path.join(outputDir, `${timestamp}_${safeTopic}_from_template`);

      // 保存 Markdown
      const mdPath = `${basePath}.md`;
      fs.writeFileSync(mdPath, content, "utf-8");

      // 转换样式格式
      const pythonStyleRules = this.convertToPythonStyle(styleRules);

      // 使用 Python 生成格式还原的 DOCX
      const docxPath = await generateDocxWithPython({
        markdown: content,
        outputPath: `${basePath}_formatted.docx`,
        styleRules: pythonStyleRules,
        addTimestamp: true
      });

      reportProgress('document_synthesis', ocrConfig.id, 'completed', `DOCX 已生成: ${path.basename(docxPath)}`);
      reportProgress('saving', undefined, 'completed', '文件已保存');

      // 统计章节数
      const sectionCount = (content.match(/^##\s/gm) || []).length + 1;

      return {
        filePath: mdPath,
        docxPath,
        sectionCount,
        wordCount: content.length,
        modelsUsed: {
          ocr: ext === '.docx' ? ocrConfig.id : null,
          vl: null,  // 不需要 VL 模型
          llm: llmConfig.name
        },
        styleRules
      };
    } catch (error) {
      reportProgress('error', undefined, 'error', error instanceof Error ? error.message : String(error));
      throw new Error(`基于模板生成文档失败: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * 构建样式提示词
   */
  private buildStylePrompt(styleRules: StyleRules): string {
    const s = styleRules;

    return `

## 文档格式规范
请严格按照以下格式生成文档：

### 标题格式
- 文档主标题：${s.title.fontFamily}，${s.title.fontSize}pt，${s.title.fontBold ? '加粗' : '常规'}，${s.title.alignment === 'center' ? '居中' : '左对齐'}
- 一级标题：${s.heading1.fontFamily}，${s.heading1.fontSize}pt，${s.heading1.fontBold !== false ? '加粗' : '常规'}
- 二级标题：${s.heading2.fontFamily}，${s.heading2.fontSize}pt，${s.heading2.fontBold !== false ? '加粗' : '常规'}
- 三级标题：${s.heading3.fontFamily}，${s.heading3.fontSize}pt

### 正文格式
- 字体：${s.body.fontFamily}
- 字号：${s.body.fontSize}pt
- 对齐：${s.body.alignment === 'justify' ? '两端对齐' : s.body.alignment}
- 行距：${s.body.lineSpacing || 1.5}倍
- 首行缩进：${s.body.indent ? '2字符' : '无'}

### 特殊格式
- 列表：使用统一的符号（如 "•"）
- 引用：使用左边框标记，灰色背景
- 表格：标准三线表格式

### Markdown 语法要求
- 一级标题使用 # 标题
- 二级标题使用 ## 标题
- 三级标题使用 ### 标题
- 列表使用 - 或 1. 开头
- 引用使用 > 开头
- 表格使用 | 分隔

请直接生成 Markdown 格式的文档内容。
`;
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
    const ptToTwips = (pt: number) => pt * 20;  // 1pt = 20 twips

    return {
      title: {
        font: {
          name: rules.title?.fontFamily || '黑体',
          size: rules.title?.fontSize || 22,
          bold: rules.title?.fontBold !== false
        },
        paragraph: {
          alignment: this.mapAlignment(rules.title?.alignment),
          space_before: ptToTwips(rules.title?.spaceBefore || 400),
          space_after: ptToTwips(rules.title?.spaceAfter || 300)
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
          space_before: ptToTwips(rules.heading1?.spaceBefore || 300),
          space_after: ptToTwips(rules.heading1?.spaceAfter || 150)
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
          space_before: ptToTwips(rules.heading2?.spaceBefore || 250),
          space_after: ptToTwips(rules.heading2?.spaceAfter || 100)
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
          space_before: ptToTwips(rules.heading3?.spaceBefore || 200),
          space_after: ptToTwips(rules.heading3?.spaceAfter || 80)
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
          space_before: ptToTwips(rules.body?.spaceBefore || 0),
          space_after: ptToTwips(rules.body?.spaceAfter || 80),
          indent_first_line: rules.body?.indent ? rules.body.indent / 240 : 0.35  // 缩进转英寸
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
          space_before: ptToTwips(rules.list?.spaceBefore || 60),
          space_after: ptToTwips(rules.list?.spaceAfter || 60)
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
          indent_left: rules.quote?.indent ? rules.quote.indent / 240 : 0.5,
          space_before: ptToTwips(rules.quote?.spaceBefore || 100),
          space_after: ptToTwips(rules.quote?.spaceAfter || 100)
        }
      },
      code: {
        font: {
          name: rules.code?.fontFamily || 'Consolas',
          size: rules.code?.fontSize || 11
        },
        paragraph: {
          alignment: this.mapAlignment(rules.code?.alignment),
          indent_left: rules.code?.indent ? rules.code.indent / 240 : 0.5,
          space_before: ptToTwips(rules.code?.spaceBefore || 150),
          space_after: ptToTwips(rules.code?.spaceAfter || 150)
        }
      },
      page_margin: {
        top: rules.pageMargin?.top ? rules.pageMargin.top / 1440 : 1.0,
        bottom: rules.pageMargin?.bottom ? rules.pageMargin.bottom / 1440 : 1.0,
        left: rules.pageMargin?.left ? rules.pageMargin.left / 1440 : 1.0,
        right: rules.pageMargin?.right ? rules.pageMargin.right / 1440 : 1.0
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
