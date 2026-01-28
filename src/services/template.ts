/**
 * 模板管理系统
 */

import * as fs from 'fs';
import * as path from 'path';

export interface TemplateInfo {
  id: string;
  name: string;
  filePath: string;
  lastModified: Date;
  description?: string;
}

export interface TemplateParseResult {
  info: TemplateInfo;
  preview: string;
}

/**
 * 模板管理器
 */
export class TemplateManager {
  private templateDir: string;

  constructor(templateDir?: string) {
    this.templateDir = templateDir || './templates';
  }

  /**
   * 获取所有模板列表
   */
  getTemplates(): TemplateInfo[] {
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
      return [];
    }

    const templates: TemplateInfo[] = [];
    const files = fs.readdirSync(this.templateDir);

    for (const file of files) {
      const filePath = path.join(this.templateDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile() && this.isDocumentFile(file)) {
        const info = this.parseTemplateInfo(file, filePath, stat);
        if (info) {
          templates.push(info);
        }
      }
    }

    return templates.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  }

  /**
   * 获取单个模板详情
   */
  getTemplate(id: string): TemplateInfo | null {
    const templates = this.getTemplates();
    return templates.find(t => t.id === id) || null;
  }

  /**
   * 解析模板信息
   */
  private parseTemplateInfo(fileName: string, filePath: string, stat: fs.Stats): TemplateInfo | null {
    const id = path.basename(fileName, path.extname(fileName))
      .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
    const name = path.basename(fileName, path.extname(fileName));

    return {
      id,
      name,
      filePath,
      lastModified: stat.mtime,
      description: `${name} - 文档模板`
    };
  }

  /**
   * 检查是否为文档文件
   */
  private isDocumentFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase();
    return ['.docx', '.pdf', '.md', '.txt'].includes(ext);
  }

  /**
   * 获取模板预览
   */
  async getTemplatePreview(templateId: string): Promise<string> {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`);
    }

    const ext = path.extname(template.filePath).toLowerCase();

    if (ext === '.md' || ext === '.txt') {
      return new Promise((resolve) => {
        fs.readFile(template.filePath, 'utf-8', (err, data) => {
          if (err) {
            resolve('无法读取文件');
            return;
          }
          const preview = data.slice(0, 1000);
          const lines = preview.split('\n').slice(0, 20).join('\n');
          resolve(lines + (data.length > 1000 ? '\n...' : ''));
        });
      });
    }

    return `[${template.name}]\nDOCX 文档预览\n路径: ${template.filePath}`;
  }

  /**
   * 删除模板
   */
  deleteTemplate(id: string): boolean {
    const template = this.getTemplate(id);
    if (!template) {
      return false;
    }
    fs.unlinkSync(template.filePath);
    return true;
  }

  /**
   * 确保模板目录存在
   */
  ensureTemplateDir(): void {
    if (!fs.existsSync(this.templateDir)) {
      fs.mkdirSync(this.templateDir, { recursive: true });
    }
  }
}

export default TemplateManager;
