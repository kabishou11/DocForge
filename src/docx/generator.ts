/**
 * DOCX 文档生成器 - 专业中文文档格式
 * 支持标题、段落、列表、表格等复杂元素
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
  convertInchesToTwip,
  convertMillimetersToTwip,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';

// mm 转 twip (1mm = 56.7 twip)
function mmToTwip(mm: number): number {
  return Math.round(mm * 56.7);
}

// pt 转 half-points (1pt = 2 half-points)
function ptToHalfPoints(pt: number): number {
  return Math.round(pt * 2);
}

// 颜色值转十六进制
function colorToHex(color: string): string {
  return color.replace('#', '');
}

export interface StyleConfig {
  version: string;
  page: {
    size: { width: number; height: number };
    margins: { top: number; right: number; bottom: number; left: number };
    orientation: 'portrait' | 'landscape';
  };
  font: {
    eastAsia: string;
    ascii: string;
    size: { heading: number; body: number; caption: number };
  };
  paragraph: {
    spacing: { line: number; before: number; after: number };
    indent: { firstLine: number };
  };
  headingStyles: Array<{
    level: number;
    styleId: string;
    name: string;
    basedOn: string;
    next: string;
    quickFormat: boolean;
  }>;
  listStyles: Array<{ level: number; format: 'bullet' | 'number'; text: string }>;
  styles: Record<string, unknown>;
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
  createdAt?: Date;
}

// 解析 Markdown 内容为结构化元素
interface ParsedElement {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'code';
  content: any;
}

function parseMarkdownContent(content: string): ParsedElement[] {
  const elements: ParsedElement[] = [];
  const lines = content.split('\n');
  let currentList: { type: 'bullet' | 'number'; items: string[] } | null = null;
  let currentParagraph = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 跳过空行
    if (!line.trim()) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push({ type: 'list', content: { ...currentList } });
        currentList = null;
      }
      continue;
    }

    // 标题检测
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push({ type: 'list', content: { ...currentList } });
        currentList = null;
      }
      elements.push({
        type: 'heading',
        content: {
          level: headingMatch[1].length,
          text: headingMatch[2].trim()
        }
      });
      continue;
    }

    // 列表项检测
    const listMatch = line.match(/^[\-\*]\s+(.+)$/);
    const numListMatch = line.match(/^\d+\.\s+(.+)$/);

    if (listMatch || numListMatch) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }

      const itemText = (listMatch || numListMatch)![1].trim();
      const listType = listMatch ? 'bullet' : 'number';

      if (!currentList || currentList.type !== listType) {
        if (currentList) {
          elements.push({ type: 'list', content: { ...currentList } });
        }
        currentList = { type: listType, items: [itemText] };
      } else {
        currentList.items.push(itemText);
      }
      continue;
    }

    // 代码块检测
    if (line.startsWith('```')) {
      if (currentParagraph) {
        elements.push({ type: 'paragraph', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      if (currentList) {
        elements.push({ type: 'list', content: { ...currentList } });
        currentList = null;
      }

      // 收集代码内容
      let codeContent = '';
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeContent += lines[i] + '\n';
        i++;
      }
      elements.push({ type: 'code', content: codeContent.trim() });
      continue;
    }

    // 普通段落
    currentParagraph += line + '\n';
  }

  // 处理最后的内容
  if (currentParagraph) {
    elements.push({ type: 'paragraph', content: currentParagraph.trim() });
  }
  if (currentList) {
    elements.push({ type: 'list', content: { ...currentList } });
  }

  return elements;
}

/**
 * DOCX 生成器
 */
export class DocxGenerator {
  private styleConfig: StyleConfig;

  constructor(styleConfig?: Partial<StyleConfig>) {
    this.styleConfig = this.mergeStyles(styleConfig);
  }

  private mergeStyles(overrides?: Partial<StyleConfig>): StyleConfig {
    const defaultConfig: StyleConfig = {
      version: 'v0.1',
      page: {
        size: { width: 210, height: 297 },
        margins: { top: 25.4, right: 31.7, bottom: 25.4, left: 31.7 },
        orientation: 'portrait'
      },
      font: {
        eastAsia: '宋体',
        ascii: 'Calibri',
        size: { heading: 15.75, body: 10.5, caption: 9 }
      },
      paragraph: {
        spacing: { line: 360, before: 0, after: 0 },
        indent: { firstLine: 2 }
      },
      headingStyles: [
        { level: 1, styleId: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true },
        { level: 2, styleId: 'Heading2', name: 'Heading 2', basedOn: 'Heading1', next: 'Normal', quickFormat: true },
        { level: 3, styleId: 'Heading3', name: 'Heading 3', basedOn: 'Heading2', next: 'Normal', quickFormat: true }
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
   * 从 Markdown 文本生成 DOCX 文件
   */
  async generateFromMarkdown(
    markdown: string,
    outputPath: string,
    options: DocumentOptions = {}
  ): Promise<void> {
    // 解析 Markdown
    const parsed = this.parseMarkdown(markdown);

    // 创建文档
    const doc = this.createDocumentFromParsed(parsed, options);
    const buffer = await Packer.toBuffer(doc);

    // 确保输出目录存在
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(outputPath, buffer);
  }

  /**
   * 解析 Markdown 为结构化数据
   */
  private parseMarkdown(markdown: string): ParsedElement[] {
    return parseMarkdownContent(markdown);
  }

  /**
   * 从结构化数据创建文档
   */
  private createDocumentFromParsed(parsed: ParsedElement[], options: DocumentOptions): Document {
    const children: Paragraph[] = [];

    // 添加标题
    if (options.title) {
      children.push(
        new Paragraph({
          text: options.title,
          style: 'Title',
          alignment: AlignmentType.CENTER,
          spacing: { before: mmToTwip(20), after: mmToTwip(20) }
        })
      );
    }

    // 解析每个元素
    for (const element of parsed) {
      switch (element.type) {
        case 'heading':
          children.push(...this.createHeading(element.content));
          break;
        case 'paragraph':
          children.push(...this.createParagraph(element.content));
          break;
        case 'list':
          children.push(...this.createList(element.content));
          break;
        case 'code':
          children.push(...this.createCodeBlock(element.content));
          break;
      }
    }

    return new Document({
      creator: options.author || 'DocForge',
      title: options.title,
      description: options.description,
      styles: this.createStyles(),
      sections: [
        {
          properties: {
            page: {
              size: {
                width: mmToTwip(this.styleConfig.page.size.width),
                height: mmToTwip(this.styleConfig.page.size.height),
                orientation: this.styleConfig.page.orientation
              },
              margin: {
                top: mmToTwip(this.styleConfig.page.margins.top),
                right: mmToTwip(this.styleConfig.page.margins.right),
                bottom: mmToTwip(this.styleConfig.page.margins.bottom),
                left: mmToTwip(this.styleConfig.page.margins.left)
              }
            }
          },
          children
        }
      ]
    });
  }

  /**
   * 创建样式定义
   */
  private createStyles() {
    return {
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          runFonts: {
            eastAsia: this.styleConfig.font.eastAsia,
            ascii: this.styleConfig.font.ascii
          },
          fontSize: ptToHalfPoints(this.styleConfig.font.size.body),
          spacing: {
            line: this.styleConfig.paragraph.spacing.line,
            before: mmToTwip(0),
            after: mmToTwip(6)
          },
          indent: {
            firstLine: mmToTwip(this.styleConfig.paragraph.indent.firstLine)
          }
        },
        {
          id: 'Title',
          name: 'Title',
          runFonts: {
            eastAsia: this.styleConfig.font.eastAsia,
            ascii: this.styleConfig.font.ascii
          },
          fontSize: ptToHalfPoints(26),
          bold: true,
          spacing: {
            before: mmToTwip(20),
            after: mmToTwip(20)
          },
          alignment: AlignmentType.CENTER
        },
        ...this.styleConfig.headingStyles.map(heading => ({
          id: heading.styleId,
          name: heading.name,
          basedOn: heading.basedOn,
          next: heading.next,
          quickFormat: heading.quickFormat,
          runFonts: {
            eastAsia: this.styleConfig.font.eastAsia,
            ascii: this.styleConfig.font.ascii
          },
          fontSize: ptToHalfPoints(this.getHeadingFontSize(heading.level)),
          bold: heading.level <= 2,
          spacing: {
            before: mmToTwip(12),
            after: mmToTwip(6)
          },
          outline: {
            level: heading.level
          }
        })),
        {
          id: 'ListParagraph',
          name: 'List Paragraph',
          basedOn: 'Normal',
          runFonts: {
            eastAsia: this.styleConfig.font.eastAsia,
            ascii: this.styleConfig.font.ascii
          },
          fontSize: ptToHalfPoints(this.styleConfig.font.size.body),
          spacing: {
            line: this.styleConfig.paragraph.spacing.line,
            before: mmToTwip(0),
            after: mmToTwip(0)
          }
        },
        {
          id: 'CodeBlock',
          name: 'Code Block',
          basedOn: 'Normal',
          runFonts: {
            eastAsia: 'Consolas',
            ascii: 'Consolas'
          },
          fontSize: ptToHalfPoints(9),
          spacing: {
            before: mmToTwip(6),
            after: mmToTwip(6)
          },
          indent: {
            firstLine: mmToTwip(4)
          },
          shading: {
            fill: '#f5f5f5'
          }
        }
      ]
    };
  }

  private getHeadingFontSize(level: number): number {
    const fontSizes: Record<number, number> = {
      1: 26,
      2: 22,
      3: 18,
      4: 16,
      5: 14,
      6: 12
    };
    return fontSizes[level] || this.styleConfig.font.size.heading;
  }

  /**
   * 创建标题
   */
  private createHeading(data: { level: number; text: string }): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const headingLevel = Math.min(data.level, 6) as 1 | 2 | 3 | 4 | 5 | 6;
    const styleId = `Heading${headingLevel}`;

    paragraphs.push(
      new Paragraph({
        text: data.text,
        style: styleId,
        spacing: { before: mmToTwip(12), after: mmToTwip(6) }
      })
    );

    return paragraphs;
  }

  /**
   * 创建段落
   */
  private createParagraph(text: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // 处理粗体和斜体
    const runs = this.parseInlineFormatting(text);

    paragraphs.push(
      new Paragraph({
        children: runs,
        style: 'Normal',
        indent: { firstLine: mmToTwip(this.styleConfig.paragraph.indent.firstLine) },
        spacing: { line: this.styleConfig.paragraph.spacing.line, after: mmToTwip(6) }
      })
    );

    return paragraphs;
  }

  /**
   * 解析行内格式（粗体、斜体等）
   */
  private parseInlineFormatting(text: string): TextRun[] {
    const runs: TextRun[] = [];
    let currentText = '';
    let isBold = false;
    let isItalic = false;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '*' && i + 1 < text.length && text[i + 1] === '*') {
        // 粗体标记
        if (currentText) {
          runs.push(new TextRun({ text: currentText, bold: isBold, italics: isItalic }));
          currentText = '';
        }
        isBold = !isBold;
        i++;
      } else if (text[i] === '*') {
        // 斜体标记
        if (currentText) {
          runs.push(new TextRun({ text: currentText, bold: isBold, italics: isItalic }));
          currentText = '';
        }
        isItalic = !isItalic;
      } else if (text[i] === '`' && i + 2 < text.length && text.slice(i, i + 3) === '```') {
        // 代码块
        i += 3;
        let codeEnd = text.indexOf('```', i);
        if (codeEnd === -1) codeEnd = text.length;
        const codeText = text.slice(i, codeEnd);
        runs.push(new TextRun({
          text: codeText,
          font: 'Consolas',
          size: ptToHalfPoints(9)
        }));
        i = codeEnd + 2;
      } else if (text[i] === '`') {
        // 行内代码
        let codeEnd = text.indexOf('`', i + 1);
        if (codeEnd === -1) codeEnd = text.length;
        const codeText = text.slice(i + 1, codeEnd);
        runs.push(new TextRun({
          text: codeText,
          font: 'Consolas',
          size: ptToHalfPoints(9),
          shading: { fill: '#f5f5f5' }
        }));
        i = codeEnd;
      } else {
        currentText += text[i];
      }
    }

    if (currentText) {
      runs.push(new TextRun({ text: currentText, bold: isBold, italics: isItalic }));
    }

    return runs.length > 0 ? runs : [new TextRun({ text })];
  }

  /**
   * 创建列表
   */
  private createList(data: { type: 'bullet' | 'number'; items: string[] }): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const prefix = data.type === 'bullet' ? '· ' : `${i + 1}. `;

      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({ text: prefix }),
            ...this.parseInlineFormatting(item)
          ],
          style: 'ListParagraph',
          indent: { left: mmToTwip(4), hanging: mmToTwip(2) },
          spacing: { after: mmToTwip(3) }
        })
      );
    }

    return paragraphs;
  }

  /**
   * 创建代码块
   */
  private createCodeBlock(code: string): Paragraph[] {
    const paragraphs: Paragraph[] = [];
    const lines = code.split('\n');
    const codeText = lines.join('\n');

    paragraphs.push(
      new Paragraph({
        children: [new TextRun({ text: codeText, font: 'Consolas', size: ptToHalfPoints(9) })],
        style: 'CodeBlock',
        indent: { left: mmToTwip(8), firstLine: mmToTwip(4) },
        spacing: { before: mmToTwip(6), after: mmToTwip(6) }
      })
    );

    return paragraphs;
  }

  /**
   * 生成文件（兼容旧接口）
   */
  async generateFile(
    sections: SectionData[],
    options: DocumentOptions = {},
    outputPath: string
  ): Promise<void> {
    // 将 sections 转换为 Markdown 格式
    let markdown = '';
    for (const section of sections) {
      const headingPrefix = '#'.repeat(Math.min(section.level, 6));
      markdown += `${headingPrefix} ${section.title}\n\n`;
      markdown += section.content + '\n\n';
    }

    await this.generateFromMarkdown(markdown, outputPath, options);
  }
}

export default DocxGenerator;
