/**
 * DocForge Python 服务
 * 使用 python-docx 实现更强大的 DOCX 功能
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import * as os from 'os';
import { randomUUID } from 'crypto';

// 项目根目录（从 dist/services/ 向上两级）
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PYTHON_SCRIPT = path.join(PROJECT_ROOT, 'scripts', 'docforge_py.py');

function createTempToken(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function resolvePythonCommand(): { command: string; args: string[] } {
  // 环境变量指定 Python 路径（最高优先级）
  const envPath = process.env.PYTHON_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return { command: envPath, args: [] };
  }

  // 环境变量指定 venv 目录
  const venvDir = process.env.PYTHON_VENV_PATH || '.venv';
  const venvPython = process.platform === 'win32'
    ? path.join(PROJECT_ROOT, venvDir, 'Scripts', 'python.exe')
    : path.join(PROJECT_ROOT, venvDir, 'bin', 'python');
  if (fs.existsSync(venvPython)) {
    return { command: venvPython, args: [] };
  }

  // 系统回退
  if (process.platform === 'win32') {
    return { command: 'py', args: [] };
  }
  return { command: process.env.PYTHON || 'python3', args: [] };
}

const PYTHON_TIMEOUT_MS = 120_000;
const MAX_CAPTURED_OUTPUT = 64 * 1024;

function appendLimited(current: string, chunk: string): string {
  const next = current + chunk;
  if (next.length <= MAX_CAPTURED_OUTPUT) {
    return next;
  }
  // 保留头部和尾部，中间标记截断，避免丢失 traceback 开头
  const headSize = Math.floor(MAX_CAPTURED_OUTPUT / 4);
  const tailSize = MAX_CAPTURED_OUTPUT - headSize - 20;
  return next.slice(0, headSize) + '\n... [truncated] ...\n' + next.slice(-tailSize);
}

function replaceFileSafely(tempOutput: string, outputPath: string): void {
  // 使用 copyFileSync + unlinkSync 替代 renameSync，避免 Windows 文件锁问题
  try {
    fs.copyFileSync(tempOutput, outputPath);
  } finally {
    // 始终清理临时文件
    try {
      fs.unlinkSync(tempOutput);
    } catch {
      // 临时文件清理失败不影响生成结果
    }
  }
}

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
  page_margin: { top: number; bottom: number; left: number; right: number; header_distance?: number; footer_distance?: number; gutter?: number };
  page_size?: { width: number; height: number; orientation: 'portrait' | 'landscape' };
}

export interface PythonDocxOptions {
  markdown: string;
  outputPath: string;
  styleRules?: PythonStyleRules;
  addTimestamp?: boolean;
  assetRoot?: string;
}

export interface PythonDocxValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * 调用 Python 脚本
 */
function runPythonScript(args: string[], timeoutMs = PYTHON_TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const pythonCommand = resolvePythonCommand();

    const child = spawn(pythonCommand.command, [...pythonCommand.args, PYTHON_SCRIPT, ...args], {
      cwd: PROJECT_ROOT
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Python script timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout = appendLimited(stdout, data.toString());
    });

    child.stderr.on('data', (data) => {
      stderr = appendLimited(stderr, data.toString());
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Python script failed: ${stderr}`));
      }
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

/**
 * 从 DOCX 模板提取样式
 */
export async function extractStylesFromDocx(docxPath: string): Promise<PythonStyleRules> {
  const tempJson = path.join(os.tmpdir(), `${createTempToken('docforge_styles')}.json`);

  try {
    await runPythonScript(['extract', docxPath, tempJson]);

    const content = fs.readFileSync(tempJson, 'utf-8');
    const styles = JSON.parse(content);

    return styles as PythonStyleRules;
  } catch (error) {
    // 如果失败，返回默认样式
    console.error('提取样式失败，使用默认样式:', error);
    return getDefaultStyleRules();
  } finally {
    try {
      if (fs.existsSync(tempJson)) {
        fs.unlinkSync(tempJson);
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 生成 DOCX 文档（使用 Python）
 */
export async function generateDocxWithPython(options: PythonDocxOptions): Promise<string> {
  const { markdown, outputPath, styleRules, addTimestamp, assetRoot } = options;
  const markdownWithTimestamp = addTimestamp
    ? `${markdown}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n生成时间：${new Date().toLocaleString('zh-CN')}\n`
    : markdown;

  // 使用系统临时目录存放临时文件
  const tempMd = path.join(os.tmpdir(), `${createTempToken('docforge')}.md`);
  fs.writeFileSync(tempMd, markdownWithTimestamp, 'utf-8');

  let tempStyle = '';
  const outputDir = path.dirname(outputPath);
  const tempOutput = path.join(outputDir, `${createTempToken('docforge_output')}_${path.basename(outputPath)}.tmp`);
  fs.mkdirSync(outputDir, { recursive: true });
  if (styleRules) {
    tempStyle = path.join(os.tmpdir(), `${createTempToken('docforge_style')}.json`);
    fs.writeFileSync(tempStyle, JSON.stringify(styleRules, null, 2), 'utf-8');
  }

  try {
    // 构建命令
    const args = ['generate', tempMd, tempOutput];
    if (tempStyle) {
      args.push('--style', tempStyle);
    }
    if (assetRoot) {
      args.push('--asset-root', assetRoot);
    }

    await runPythonScript(args);
    replaceFileSafely(tempOutput, outputPath);

    return outputPath;
  } finally {
    // 清理临时文件
    try {
      fs.unlinkSync(tempMd);
      if (tempStyle && fs.existsSync(tempStyle)) {
        fs.unlinkSync(tempStyle);
      }
      if (fs.existsSync(tempOutput)) {
        fs.unlinkSync(tempOutput);
      }
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 校验 DOCX 包结构
 */
export async function validateDocxWithPython(docxPath: string): Promise<PythonDocxValidationResult> {
  try {
    const stdout = await runPythonScript(['validate', docxPath]);
    return JSON.parse(stdout) as PythonDocxValidationResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, errors: [message] };
  }
}

/**
 * 获取默认样式规则
 */
export function getDefaultStyleRules(): PythonStyleRules {
  // 所有 space_before/space_after 单位为 pt（传给 Python Pt()）
  return {
    title: {
      font: { name: '黑体', size: 22, bold: true },
      paragraph: { alignment: 'center', space_before: 12, space_after: 6 }
    },
    heading1: {
      font: { name: '黑体', size: 16, bold: true },
      paragraph: { alignment: 'left', space_before: 12, space_after: 6 }
    },
    heading2: {
      font: { name: '楷体', size: 14, bold: true },
      paragraph: { alignment: 'left', space_before: 10, space_after: 4 }
    },
    heading3: {
      font: { name: '宋体', size: 12, bold: true },
      paragraph: { alignment: 'left', space_before: 8, space_after: 4 }
    },
    body: {
      font: { name: '宋体', size: 12, bold: false },
      paragraph: {
        alignment: 'justify',
        line_spacing: 1.5,
        space_before: 0,
        space_after: 3,
        indent_first_line: 0.33
      }
    },
    list: {
      font: { name: '宋体', size: 12, bold: false },
      paragraph: { alignment: 'left', space_before: 2, space_after: 2 }
    },
    quote: {
      font: { name: '楷体', size: 12, italic: true },
      paragraph: { alignment: 'left', indent_left: 0.4, space_before: 4, space_after: 4 }
    },
    code: {
      font: { name: 'Consolas', size: 11 },
      paragraph: { alignment: 'left', indent_left: 0.4, space_before: 6, space_after: 6 }
    },
    page_margin: { top: 1.0, bottom: 1.0, left: 1.25, right: 1.25 },
    page_size: { width: 8.27, height: 11.69, orientation: 'portrait' as const }
  };
}

export default {
  extractStylesFromDocx,
  generateDocxWithPython,
  validateDocxWithPython,
  getDefaultStyleRules
};
