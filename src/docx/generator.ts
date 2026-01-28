/**
 * DOCX 文档生成器
 *
 * 使用 docx 库生成 Word 文档，支持：
 * - 页面设置（纸张大小、边距）
 * - 字体样式（中文字体、英文字体）
 * - 段落样式（标题、正文、列表）
 * - 风格模板驱动
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  WidthType,
  BorderStyle,
  ShadingType,
  convertInchesToTwip,
  convertMMToTwip
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';

export interface StyleConfig {
  version: string;
  page: {
    size: {
      width: number; // mm
      height: number; // mm
    };
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    orientation: 'portrait' | 'landscape';
  };
  font: {
    eastAsia: string; // 中文字体
    ascii: string; // 英文字体
    size: {
      heading: number; // 标题字号 (pt)
      body: number; // 正文字号 (pt)
      caption: number; //  caption 字号 (pt)
    };
  };
  paragraph: {
    spacing: {
      line: number; // 行距
      before: number; // 段前
      after: number; // 段后
    };
    indent: {
      firstLine: number; // 首行缩进 (mm)
    };
  };
  headingStyles: Array<{
    level: number;
    styleId: string;
    name: string;
    basedOn: string;
    next: string;
    quickFormat: boolean;
  }>;
  listStyles: Array<{
    level: number;
    format: 'bullet' | 'number';
    text: string;
  }>;
  styles: Record<string, {
    runFonts?: {
      eastAsia?: string;
      ascii?: string;
    };
    fontSize?: number;
    spacing?: {
      before?: number;
      after?: number;
      line?: number;
    };
    indent?: {
      left?: number;
      hanging?: number;
    };
    alignment?: AlignmentType;
    shading?: {
      fill: string;
    };
  }>;
}

export interface SectionData {
  id: string;
  title: string;
  level: number;
  content: string;
}

export interface DocumentOptions {
  title?: string;
  description?: string;
  author?: string;
  company?: string;
  createdAt?: Date;
}

/**
 * DOCX 生成器
 */
export class DocxGenerator {
  private styleConfig: StyleConfig;

  constructor(styleConfig?: Partial<StyleConfig>) {
    this.styleConfig = this.mergeStyles(styleConfig);
  }

  /**
   * 合并默认配置
   */
  private mergeStyles(overrides?: Partial<StyleConfig>): StyleConfig {
    const defaultConfig: StyleConfig = {
      version: 'v0.1',
      page: {
        size: {
          width: 210, // A4
          height: 297
        },
        margins: {
          top: 25.4,
          right: 31.7,
          bottom: 25.4,
          left: 31.7
        },
        orientation: 'portrait'
      },
      font: {
        eastAsia: '宋体',
        ascii: 'Calibri',
        size: {
          heading: 15.75, // 二号
          body: 10.5, // 小四
          caption: 9 // 五号
        },
      },
      paragraph: {
        spacing: {
          line: 1.5 * 240, // 1.5倍行距 (docx 使用 twip)
          before: 0,
          after: 0
        },
        indent: {
          firstLine: 2 * 20 // 首行缩进 2 字符 (约 2 * 20 twip)
        }
      },
      headingStyles: [
        {
          level: 1,
          styleId: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true
        },
        {
          level: 2,
          styleId: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Heading1',
          next: 'Normal',
          quickFormat: true
        },
        {
          level: 3,
          styleId: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Heading2',
          next: 'Normal',
          quickFormat: true
        }
      ],
      listStyles: [],
      styles: {}
    };

    return {
      ...defaultConfig,
      ...overrides,
      page: { ...defaultConfig.page, ...overrides?.page },
      font: { ...defaultConfig.font, ...overrides?.font },
      paragraph: { ...defaultConfig.paragraph, ...overrides?.paragraph },
      headingStyles: overrides?.headingStyles || defaultConfig.headingStyles,
      listStyles: overrides?.listStyles || defaultConfig.listStyles,
      styles: { ...defaultConfig.styles, ...overrides?.styles }
    };
  }

  /**
   * 生成文档
   */
  async generate(
    sections: SectionData[],
    options: DocumentOptions = {},
    outputPath?: string
  ): Promise<Document> {
    const doc = this.createDocument(sections, options);

    if (outputPath) {
      const buffer = await Packer.toBuffer(doc);
      await fs.promises.writeFile(outputPath, buffer);
    }

    return doc;
  }

  /**
   * 生成并保存文档
   */
  async generateFile(
    sections: SectionData[],
    options: DocumentOptions = {},
    outputPath: string
  ): Promise<void> {
    const buffer = await Packer.toBuffer(
      this.createDocument(sections, options)
    );
    await fs.promises.writeFile(outputPath, buffer);
  }

  /**
   * 创建文档对象
   */
  private createDocument(
    sections: SectionData[],
    options: DocumentOptions
  ): Document {
    return new Document({
      creator: options.author || 'CLAUDE_DECODE',
      title: options.title,
      description: options.description,
      company: options.company || 'XYJK',
      created: options.createdAt || new Date(),
      styles: this.createStyles(),
      sections: [
        {
          properties: {
            page: {
              size: {
                width: convertMMToTwip(this.styleConfig.page.size.width),
                height: convertMMToTwip(this.styleConfig.page.size.height),
                orientation: this.styleConfig.page.orientation
              },
              margins: {
                top: convertMMToTwip(this.styleConfig.page.margins.top),
                right: convertMMToTwip(this.styleConfig.page.margins.right),
                bottom: convertMMToTwip(this.styleConfig.page.margins.bottom),
                left: convertMMToTwip(this.styleConfig.page.margins.left)
              }
            }
          },
          children: this.createSectionChildren(sections)
        }
      ]
    });
  }

  /**
   * 创建样式定义
   */
  private createStyles() {
    const styles: { paragraphStyles: Array<Record<string, unknown>> } = {
      paragraphStyles: []
    };

    // 默认正文样式
    styles.paragraphStyles.push({
      id: 'Normal',
      name: 'Normal',
      runFonts: {
        eastAsia: this.styleConfig.font.eastAsia,
        ascii: this.styleConfig.font.ascii
      },
      fontSize: {
        size: this.styleConfig.font.size.body * 2, // docx 使用 half-points
        val: this.styleConfig.font.size.body * 2
      },
      spacing: {
        line: this.styleConfig.paragraph.spacing.line,
        before: convertMMToTwip(0),
        after: convertMMToTwip(0)
      },
      indent: {
        firstLine: convertMMToTwip(this.styleConfig.paragraph.indent.firstLine)
      }
    });

    // 标题样式
    for (const heading of this.styleConfig.headingStyles) {
      const fontSize = this.getHeadingFontSize(heading.level);
      styles.paragraphStyles.push({
        id: heading.styleId,
        name: heading.name,
        basedOn: heading.basedOn,
        next: heading.next,
        quickFormat: heading.quickFormat,
        runFonts: {
          eastAsia: this.styleConfig.font.eastAsia,
          ascii: this.styleConfig.font.ascii
        },
        fontSize: {
          size: fontSize * 2,
          val: fontSize * 2
        },
        spacing: {
          before: convertMMToTwip(12),
          after: convertMMToTwip(6)
        },
        outline: {
          level: heading.level,
          val: HeadingLevel[heading.level as keyof typeof HeadingLevel]
        }
      });
    }

    return styles;
  }

  /**
   * 根据级别获取标题字号
   */
  private getHeadingFontSize(level: number): number {
    const fontSizes: Record<number, number> = {
      1: 22, // 一号
      2: 16, // 二号
      3: 15, // 小二号
      4: 14, // 三号
      5: 12  // 四号
    };
    return fontSizes[level] || this.styleConfig.font.size.heading;
  }

  /**
   * 创建章节子元素
   */
  private createSectionChildren(sections: SectionData[]): Paragraph[] {
    const children: Paragraph[] = [];

    for (const section of sections) {
      children.push(...this.createSection(section));
    }

    return children;
  }

  /**
   * 创建单个章节
   */
  private createSection(section: SectionData): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // 标题
    const headingLevel = Math.min(section.level, 3) as 1 | 2 | 3;
    const styleId = `Heading${headingLevel}`;

    paragraphs.push(
      new Paragraph({
        text: section.title,
        style: styleId,
        spacing: {
          before: convertMMToTwip(12),
          after: convertMMToTwip(6)
        }
      })
    );

    // 正文内容 - 按段落分割
    const contentParagraphs = section.content.split('\n').filter(p => p.trim());
    for (const para of contentParagraphs) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: para.trim() })],
          style: 'Normal',
          indent: {
            firstLine: convertMMToTwip(this.styleConfig.paragraph.indent.firstLine)
          },
          spacing: {
            line: this.styleConfig.paragraph.spacing.line
          }
        })
      );
    }

    return paragraphs;
  }

  /**
   * 获取当前风格配置
   */
  getStyleConfig(): StyleConfig {
    return { ...this.styleConfig };
  }

  /**
   * 更新风格配置
   */
  updateStyleConfig(config: Partial<StyleConfig>): void {
    this.styleConfig = this.mergeStyles(config);
  }
}

/**
 * 加载风格配置
 */
export async function loadStyleConfig(filePath: string): Promise<StyleConfig> {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export default DocxGenerator;
