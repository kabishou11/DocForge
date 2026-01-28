/**
 * DocForge TUI 控制器 - 抄自 OpenCode 架构
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
  private vlModels: ModelInfo[] = [];
  private messages: Message[] = [];

  constructor(options?: ControllerOptions) {
    super();

    // 初始化配置
    this.configManager = new ConfigManager();
    if (options?.apiKey) {
      this.configManager.setApiKey(options.apiKey);
    }

    // 初始化服务
    this.llmClient = createLLMClient(this.configManager.getApiKey());
    this.modelService = new ModelScopeService(this.configManager);

    // 加载模型
    this.loadModels();
  }

  private async loadModels(): Promise<void> {
    try {
      this.llmModels = await this.modelService.listLLMModels();
      this.vlModels = await this.modelService.listVLModels();
    } catch (error) {
      console.error("加载模型列表失败:", error);
    }
  }

  /**
   * 获取模型配置信息
   */
  getModelConfig(): { provider: string; hasApiKey: boolean; llm: string; vl: string } {
    const config = this.modelService.getConfigInfo();
    return {
      provider: config.provider,
      hasApiKey: config.hasApiKey,
      llm: config.llm.name,
      vl: config.vl.name,
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
      case "vl":
        return {
          type: "model-select",
          data: {
            models: this.vlModels.map((m) => ({
              id: m.id,
              name: m.name,
              description: m.description || "",
            })),
            title: "选择 VL 模型",
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
    this.llmClient = createLLMClient(this.configManager.getApiKey());
    return true;
  }

  /**
   * 设置 LLM 模型
   */
  setLLM(modelId: string): boolean {
    const model = this.llmModels.find((m) => m.id === modelId);
    if (model) {
      this.modelService.setLLM(model.id, model.name);
      return true;
    }
    return false;
  }

  /**
   * 设置 VL 模型
   */
  setVL(modelId: string): boolean {
    const model = this.vlModels.find((m) => m.id === modelId);
    if (model) {
      this.modelService.setVL(model.id, model.name);
      return true;
    }
    return false;
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
   * 获取 VL 模型列表
   */
  getVLModels(): ModelInfo[] {
    return this.vlModels;
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
   * 基于模板生成文档
   */
  async generateDocumentFromTemplate(
    templatePath: string,
    topic: string,
    description: string
  ): Promise<{
    filePath: string;
    sectionCount: number;
    wordCount: number;
  }> {
    try {
      // 读取模板内容
      if (!fs.existsSync(templatePath)) {
        throw new Error(`模板文件不存在: ${templatePath}`);
      }

      let templateContent: string;
      const ext = path.extname(templatePath).toLowerCase();

      // 根据文件类型选择读取方式
      if (ext === '.docx') {
        // 使用 mammoth 提取 docx 文本
        try {
          const buffer = fs.readFileSync(templatePath);
          const result = await mammoth.extractRawText({ buffer });
          templateContent = result.value;
          if (result.messages.length > 0) {
            console.warn(`读取 docx 时出现警告: ${result.messages.join(', ')}`);
          }
        } catch (mammothError) {
          throw new Error(`读取 docx 文件失败: ${mammothError instanceof Error ? mammothError.message : mammothError}`);
        }
      } else if (ext === '.md' || ext === '.txt') {
        // 直接读取文本文件
        templateContent = fs.readFileSync(templatePath, "utf-8");
      } else {
        // 其他文件类型尝试用文本方式读取
        try {
          templateContent = fs.readFileSync(templatePath, "utf-8");
        } catch {
          throw new Error(`不支持的文件格式: ${ext}`);
        }
      }

      // 如果模板内容太短，给出警告
      if (templateContent.length < 100) {
        throw new Error(`模板内容太短 (${templateContent.length} 字符)，请确保模板文件包含足够的文档内容。`);
      }

      // 分析模板并生成新文档
      const content = await this.llmClient.generateDocumentFromTemplate(
        templateContent,
        topic,
        description
      );

      // 确保输出目录存在
      const outputDir = "./output";
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 生成文件名
      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, "_").slice(0, 30);
      const filePath = path.join(outputDir, `${timestamp}_${safeTopic}_from_template.md`);

      // 保存文件
      fs.writeFileSync(filePath, content, "utf-8");

      // 粗略统计章节数
      const sectionCount = (content.match(/^##\s/gm) || []).length + 1;

      return {
        filePath,
        sectionCount,
        wordCount: content.length,
      };
    } catch (error) {
      throw new Error(`基于模板生成文档失败: ${error instanceof Error ? error.message : error}`);
    }
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
}

export default TuiController;
