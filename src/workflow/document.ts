/**
 * 文档生成工作流
 *
 * 协调 LLM 客户端、风格配置和 DOCX 生成器
 */

import { LLMClient, ChatMessage } from '../llm/client';
import { DocxGenerator, StyleConfig } from '../docx/generator';

export interface WorkflowOptions {
  llmClient: LLMClient;
  styleConfig?: Partial<StyleConfig> | string; // 路径或对象
  outputPath?: string;
  debug?: boolean;
}

export interface GenerateOptions {
  topic: string;
  description: string;
  language?: 'zh' | 'en';
  sectionCount?: number; // 章节数量限制
}

export interface WorkflowResult {
  documentPath: string;
  outline: {
    sections: Array<{ id: string; title: string; level: number; summary: string }>;
    wordCount: string;
  };
  sections: Array<{ id: string; title: string; content: string }>;
}

/**
 * 文档生成工作流
 */
export class DocumentWorkflow {
  private llmClient: LLMClient;
  private docxGenerator: DocxGenerator;
  private styleConfig: Partial<StyleConfig>;
  private outputPath?: string;
  private debug: boolean;

  constructor(options: WorkflowOptions) {
    this.llmClient = options.llmClient;
    this.debug = options.debug ?? false;

    // 加载风格配置
    if (typeof options.styleConfig === 'string') {
      // 从文件加载
      // this.styleConfig = await loadStyleConfig(options.styleConfig);
      // 这里需要异步处理，在 initialize 方法中处理
      this.styleConfig = {};
    } else {
      this.styleConfig = options.styleConfig || {};
    }

    this.docxGenerator = new DocxGenerator(this.styleConfig);
    this.outputPath = options.outputPath;
  }

  /**
   * 初始化（异步加载配置）
   */
  async initialize(): Promise<void> {
    if (this.styleConfig && typeof (this.styleConfig as Record<string, unknown>) === 'object') {
      // 已经提供了配置对象
      return;
    }
    // 使用默认配置
    this.styleConfig = {};
  }

  /**
   * 执行文档生成
   */
  async generate(options: GenerateOptions): Promise<WorkflowResult> {
    console.log('🚀 开始文档生成流程...');

    // Step 1: 生成大纲
    console.log('📋 Step 1: 生成文档大纲...');
    const outlineResult = await this.llmClient.generateOutline(
      options.topic,
      options.description,
      'v0.1'
    );

    // 确保有 wordCount
    const outline = {
      sections: outlineResult.sections,
      wordCount: outlineResult.wordCount || '2000-3000'
    };

    if (this.debug) {
      console.log('大纲预览:', JSON.stringify(outline, null, 2));
    }

    // Step 2: 生成各章节内容
    console.log('📝 Step 2: 生成章节内容...');
    const sections: Array<{ id: string; title: string; content: string }> = [];

    for (const section of outline.sections) {
      console.log(`  - 生成章节: ${section.title}`);
      const content = await this.llmClient.generateSection(
        section,
        options.topic,
        this.styleConfig as Record<string, unknown>
      );
      sections.push({
        id: section.id,
        title: section.title,
        content
      });
    }

    // Step 3: 生成 DOCX
    console.log('📄 Step 3: 生成 DOCX 文档...');
    const outputFile = this.outputPath || `./output/${options.topic.replace(/\s+/g, '_')}.docx`;

    await this.docxGenerator.generateFile(
      sections.map(s => ({
        id: s.id,
        title: s.title,
        level: outline.sections.find(out => out.id === s.id)?.level || 1,
        content: s.content
      })),
      {
        title: options.topic,
        description: options.description
      },
      outputFile
    );

    console.log(`✅ 文档已生成: ${outputFile}`);

    return {
      documentPath: outputFile,
      outline,
      sections
    };
  }

  /**
   * 直接从现有大纲生成文档
   */
  async generateFromOutline(
    topic: string,
    description: string,
    outlineInput: { sections: Array<{ id: string; title: string; level: number; summary: string }> }
  ): Promise<WorkflowResult> {
    // 确保 outline 有 wordCount
    const outline = {
      sections: outlineInput.sections,
      wordCount: '2000-3000'
    };

    console.log('🚀 使用现有大纲生成文档...');

    // 生成各章节内容
    const sections: Array<{ id: string; title: string; content: string }> = [];

    for (const section of outline.sections) {
      console.log(`  - 生成章节: ${section.title}`);
      const content = await this.llmClient.generateSection(
        section,
        topic,
        this.styleConfig as Record<string, unknown>
      );
      sections.push({
        id: section.id,
        title: section.title,
        content
      });
    }

    // 生成 DOCX
    const outputFile = this.outputPath || `./output/${topic.replace(/\s+/g, '_')}.docx`;

    await this.docxGenerator.generateFile(
      sections.map(s => ({
        id: s.id,
        title: s.title,
        level: outline.sections.find(out => out.id === s.id)?.level || 1,
        content: s.content
      })),
      {
        title: topic,
        description: description
      },
      outputFile
    );

    return {
      documentPath: outputFile,
      outline,
      sections
    };
  }
}

export default DocumentWorkflow;
