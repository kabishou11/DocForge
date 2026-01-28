/**
 * 视觉分析服务 - 使用 VL 模型分析文档样式
 */

import * as fs from 'fs';
import * as path from 'path';
import { LLMClient, ChatMessage, extractText } from '../llm/client';
import { DocumentStyle } from '../types';

export interface StyleAnalysisResult {
  style: DocumentStyle;
  summary: string;
  confidence: number;
}

/**
 * 视觉分析服务
 */
export class VisionAnalyzer {
  private llmClient: LLMClient;

  constructor(llmClient: LLMClient) {
    this.llmClient = llmClient;
  }

  /**
   * 分析文档图片/截图的样式
   *
   * @param imagePath 图片路径
   * @returns 样式分析结果
   */
  async analyzeDocumentStyle(imagePath: string): Promise<StyleAnalysisResult> {
    // 将图片转为 base64
    const imageBase64 = await this.imageToBase64(imagePath);

    // 构建分析 prompt
    const prompt = this.buildStyleAnalysisPrompt();

    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } }
        ]
      }
    ];

    const response = await this.llmClient.chat({
      model: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
      messages,
      enableThinking: false
    });

    const content = extractText(response.choices[0].message.content);

    // 解析 JSON 结果
    return this.parseAnalysisResult(content);
  }

  /**
   * 构建样式分析 prompt
   */
  private buildStyleAnalysisPrompt(): string {
    return `请分析这张文档图片的排版和样式特征，输出 JSON 格式：

{
  "pageSize": {"width": 210, "height": 297},  // A4 单位mm
  "margins": {"top": 25.4, "right": 31.7, "bottom": 25.4, "left": 31.7},
  "fonts": {
    "eastAsia": "宋体",  // 中文字体名称
    "ascii": "Calibri",  // 英文字体名称
    "heading": 15.75,    // 标题字号(pt)
    "body": 10.5         // 正文字号(pt)
  },
  "headingStyles": [
    {"level": 1, "styleId": "Heading1", "name": "一级标题", "fontSize": 22}
  ],
  "summary": "文档样式概述",
  "confidence": 0.9
}

请仔细观察：
1. 纸张大小和页边距
2. 标题层级和字体大小
3. 正文字体和行距
4. 段落缩进方式
5. 列表样式
6. 表格样式（如有）

只输出 JSON，不要其他内容。`;
  }

  /**
   * 将图片转为 base64
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(imagePath, (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(data.toString('base64'));
      });
    });
  }

  /**
   * 解析分析结果
   */
  private parseAnalysisResult(content: string): StyleAnalysisResult {
    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          style: result,
          summary: result.summary || '样式分析完成',
          confidence: result.confidence || 0.8
        };
      }
    } catch {
      // 解析失败，返回默认值
    }

    // 返回默认样式
    return {
      style: this.getDefaultStyle(),
      summary: '使用默认样式',
      confidence: 0.5
    };
  }

  /**
   * 获取默认样式
   */
  private getDefaultStyle(): DocumentStyle {
    return {
      pageSize: { width: 210, height: 297 },
      margins: { top: 25.4, right: 31.7, bottom: 25.4, left: 31.7 },
      fonts: {
        eastAsia: '宋体',
        ascii: 'Calibri',
        heading: 15.75,
        body: 10.5
      },
      headingStyles: [
        { level: 1, styleId: 'Heading1', name: '一级标题', fontSize: 22 },
        { level: 2, styleId: 'Heading2', name: '二级标题', fontSize: 16 },
        { level: 3, styleId: 'Heading3', name: '三级标题', fontSize: 15 }
      ]
    };
  }

  /**
   * 分析多个参考文档，取平均/最优样式
   */
  async analyzeMultipleTemplates(imagePaths: string[]): Promise<StyleAnalysisResult> {
    const results = await Promise.all(
      imagePaths.map(path => this.analyzeDocumentStyle(path))
    );

    // 选择置信度最高的
    const best = results.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return {
      ...best,
      summary: `从 ${imagePaths.length} 份参考文档中分析得出`
    };
  }
}

export default VisionAnalyzer;
