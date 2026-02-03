/**
 * DocForge Python 服务
 * 使用 python-docx 实现更强大的 DOCX 功能
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';

const PYTHON_SCRIPT = path.join(__dirname, 'docforge_py.py');

export interface PythonStyleRules {
  title: {
    font: { name: string; size: number; bold: boolean };
    paragraph: { alignment: string; space_before: number; space_after: number };
  };
  heading1: {
    font: { name: string; size: number; bold: boolean };
    paragraph: { alignment: string; space_before: number; space_after: number };
  };
  heading2: {
    font: { name: string; size: number; bold: boolean };
    paragraph: { alignment: string; space_before: number; space_after: number };
  };
  heading3: {
    font: { name: string; size: number; bold: boolean };
    paragraph: { alignment: string; space_before: number; space_after: number };
  };
  body: {
    font: { name: string; size: number; bold: boolean };
    paragraph: {
      alignment: string;
      line_spacing: number;
      space_before: number;
      space_after: number;
      indent_first_line: number;
    };
  };
  list: {
    font: { name: string; size: number; bold: boolean };
    paragraph: { alignment: string; space_before: number; space_after: number };
  };
  quote: {
    font: { name: string; size: number; italic: boolean };
    paragraph: { alignment: string; indent_left: number; space_before: number; space_after: number };
  };
  code: {
    font: { name: string; size: number };
    paragraph: { alignment: string; indent_left: number; space_before: number; space_after: number };
  };
  page_margin: { top: number; bottom: number; left: number; right: number };
}

export interface PythonDocxOptions {
  markdown: string;
  outputPath: string;
  styleRules?: PythonStyleRules;
  addTimestamp?: boolean;
}

/**
 * 调用 Python 脚本
 */
function runPythonScript(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const venvPython = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');

    const child = spawn(venvPython, [PYTHON_SCRIPT, ...args], {
      cwd: __dirname
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * 从 DOCX 模板提取样式
 */
export async function extractStylesFromDocx(docxPath: string): Promise<PythonStyleRules> {
  const tempJson = path.join(__dirname, `temp_styles_${Date.now()}.json`);

  try {
    await runPythonScript(['extract', docxPath, tempJson]);

    const content = fs.readFileSync(tempJson, 'utf-8');
    const styles = JSON.parse(content);

    fs.unlinkSync(tempJson);

    return styles as PythonStyleRules;
  } catch (error) {
    // 如果失败，返回默认样式
    console.error('提取样式失败，使用默认样式:', error);
    return getDefaultStyleRules();
  }
}

/**
 * 生成 DOCX 文档（使用 Python）
 */
export async function generateDocxWithPython(options: PythonDocxOptions): Promise<string> {
  const { markdown, outputPath, styleRules, addTimestamp } = options;

  // 保存 Markdown 到临时文件
  const tempMd = path.join(__dirname, `temp_${Date.now()}.md`);
  fs.writeFileSync(tempMd, markdown, 'utf-8');

  // 保存样式到临时文件
  let tempStyle = '';
  if (styleRules) {
    tempStyle = path.join(__dirname, `temp_style_${Date.now()}.json`);
    fs.writeFileSync(tempStyle, JSON.stringify(styleRules), 'utf-8');
  }

  try {
    // 构建命令
    const args = ['generate', tempMd, outputPath];
    if (tempStyle) {
      args.push('--style', tempStyle);
    }

    await runPythonScript(args);

    // 添加时间戳（如果需要）
    if (addTimestamp) {
      await addTimestampToDocx(outputPath);
    }

    return outputPath;
  } finally {
    // 清理临时文件
    try {
      fs.unlinkSync(tempMd);
      if (tempStyle && fs.existsSync(tempStyle)) {
        fs.unlinkSync(tempStyle);
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 添加时间戳到 DOCX（简单实现）
 */
async function addTimestampToDocx(docxPath: string): Promise<void> {
  const timestamp = `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n生成时间：${new Date().toLocaleString('zh-CN')}`;

  // 追加到 Markdown 文件
  const mdPath = docxPath.replace('_formatted.docx', '.md');
  if (fs.existsSync(mdPath)) {
    const content = fs.readFileSync(mdPath, 'utf-8');
    fs.writeFileSync(mdPath, content + timestamp, 'utf-8');
  }
}

/**
 * 获取默认样式规则
 */
export function getDefaultStyleRules(): PythonStyleRules {
  return {
    title: {
      font: { name: '黑体', size: 22, bold: true },
      paragraph: { alignment: 'center', space_before: 400, space_after: 300 }
    },
    heading1: {
      font: { name: '黑体', size: 16, bold: true },
      paragraph: { alignment: 'left', space_before: 300, space_after: 150 }
    },
    heading2: {
      font: { name: '楷体', size: 14, bold: true },
      paragraph: { alignment: 'left', space_before: 250, space_after: 100 }
    },
    heading3: {
      font: { name: '宋体', size: 12, bold: true },
      paragraph: { alignment: 'left', space_before: 200, space_after: 80 }
    },
    body: {
      font: { name: '宋体', size: 12, bold: false },
      paragraph: {
        alignment: 'justify',
        line_spacing: 1.5,
        space_before: 0,
        space_after: 80,
        indent_first_line: 0.35
      }
    },
    list: {
      font: { name: '宋体', size: 12, bold: false },
      paragraph: { alignment: 'left', space_before: 60, space_after: 60 }
    },
    quote: {
      font: { name: '楷体', size: 12, italic: true },
      paragraph: { alignment: 'left', indent_left: 0.5, space_before: 100, space_after: 100 }
    },
    code: {
      font: { name: 'Consolas', size: 11 },
      paragraph: { alignment: 'left', indent_left: 0.5, space_before: 150, space_after: 150 }
    },
    page_margin: { top: 1.0, bottom: 1.0, left: 1.0, right: 1.0 }
  };
}

export default {
  extractStylesFromDocx,
  generateDocxWithPython,
  getDefaultStyleRules
};
