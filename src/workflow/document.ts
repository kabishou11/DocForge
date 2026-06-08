/**
 * 文档生成工作流
 *
 * 协调 LLM 客户端、风格配置和 DOCX 生成器
 */

import { LLMClient } from '../llm/client';
import type { StyleConfig } from '../docx/generator';
import { generateDocxWithPython, getDefaultStyleRules, type PythonStyleRules } from '../services/python-docx';
import { buildTimestampedDocumentStem } from '../utils/path-safety';
import * as fs from 'fs';
import * as path from 'path';

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
    const outputFile = this.outputPath || path.join('./output', `${buildTimestampedDocumentStem(options.topic, 'from_scratch')}.docx`);
    this.ensureOutputDirectory(outputFile);

    await generateDocxWithPython({
      markdown: this.sectionsToMarkdown(options.topic, sections, outline.sections),
      outputPath: outputFile,
      styleRules: this.convertStyleConfigToPython(),
      addTimestamp: true,
    });

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
    const outputFile = this.outputPath || path.join('./output', `${buildTimestampedDocumentStem(topic, 'from_outline')}.docx`);
    this.ensureOutputDirectory(outputFile);

    await generateDocxWithPython({
      markdown: this.sectionsToMarkdown(topic, sections, outline.sections),
      outputPath: outputFile,
      styleRules: this.convertStyleConfigToPython(),
      addTimestamp: true,
    });

    return {
      documentPath: outputFile,
      outline,
      sections
    };
  }

  private ensureOutputDirectory(outputFile: string): void {
    const dir = path.dirname(outputFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private sectionsToMarkdown(
    topic: string,
    sections: Array<{ id: string; title: string; content: string }>,
    outlineSections: Array<{ id: string; title: string; level: number }>
  ): string {
    const body = sections.map(section => {
      const outline = outlineSections.find(item => item.id === section.id);
      const level = Math.max(2, Math.min((outline?.level || 1) + 1, 6));
      return `${'#'.repeat(level)} ${section.title}\n\n${section.content.trim()}`;
    }).join('\n\n');

    return `# ${topic}\n\n${body}\n`;
  }

  private convertStyleConfigToPython(): PythonStyleRules {
    const defaults = getDefaultStyleRules();
    const fontFamily = this.styleConfig.font?.eastAsia || defaults.body.font.name;
    const asciiFont = this.styleConfig.font?.ascii || 'Calibri';
    const headingSize = this.styleConfig.font?.size?.heading || 15.75;
    const bodySize = this.styleConfig.font?.size?.body || 10.5;
    const captionSize = this.styleConfig.font?.size?.caption || 9;
    const lineSpacing = this.styleConfig.paragraph?.spacing?.line
      ? Math.max(1, Math.round((this.styleConfig.paragraph.spacing.line / 240) * 100) / 100)
      : 1.5;
    const spaceBefore = this.styleConfig.paragraph?.spacing?.before || 0;
    const spaceAfter = this.styleConfig.paragraph?.spacing?.after || 0;
    const indentFirstLineMm = this.styleConfig.paragraph?.indent?.firstLine || 2;
    const mmToInches = (mm: number) => Math.round((mm / 25.4) * 100) / 100;
    const twipsToPt = (twips: number) => Math.round((twips / 20) * 100) / 100;

    return {
      title: {
        font: { name: fontFamily, size: Math.round(headingSize * 1.65), bold: true },
        paragraph: { alignment: 'center', space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      heading1: {
        font: { name: fontFamily, size: Math.round(headingSize), bold: true },
        paragraph: { alignment: 'left', space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      heading2: {
        font: { name: fontFamily, size: Math.max(12, Math.round(headingSize * 0.9)), bold: true },
        paragraph: { alignment: 'left', space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      heading3: {
        font: { name: fontFamily, size: Math.max(11, Math.round(headingSize * 0.8)), bold: true },
        paragraph: { alignment: 'left', space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      body: {
        font: { name: fontFamily, size: bodySize, bold: false },
        paragraph: {
          alignment: 'justify',
          line_spacing: lineSpacing,
          space_before: twipsToPt(spaceBefore),
          space_after: twipsToPt(spaceAfter),
          indent_first_line: mmToInches(indentFirstLineMm)
        }
      },
      list: {
        font: { name: fontFamily, size: bodySize, bold: false },
        paragraph: { alignment: 'left', space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      quote: {
        font: { name: fontFamily, size: bodySize, italic: true },
        paragraph: { alignment: 'left', indent_left: 0.4, space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      code: {
        font: { name: asciiFont, size: captionSize },
        paragraph: { alignment: 'left', indent_left: 0.4, space_before: twipsToPt(spaceBefore), space_after: twipsToPt(spaceAfter) }
      },
      page_margin: {
        top: this.styleConfig.page?.margins?.top ? mmToInches(this.styleConfig.page.margins.top) : defaults.page_margin.top,
        bottom: this.styleConfig.page?.margins?.bottom ? mmToInches(this.styleConfig.page.margins.bottom) : defaults.page_margin.bottom,
        left: this.styleConfig.page?.margins?.left ? mmToInches(this.styleConfig.page.margins.left) : defaults.page_margin.left,
        right: this.styleConfig.page?.margins?.right ? mmToInches(this.styleConfig.page.margins.right) : defaults.page_margin.right
      }
    };
  }
}

export default DocumentWorkflow;
