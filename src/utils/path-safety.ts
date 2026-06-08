import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

export interface FileNameOptions {
  allowedExtensions?: string[];
  fallbackBaseName?: string;
  maxLength?: number;
}

function normalizeAllowedExtensions(extensions?: string[]): Set<string> | undefined {
  if (!extensions) return undefined;
  return new Set(extensions.map(ext => ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`));
}

function isInsideDirectory(baseDir: string, targetPath: string): boolean {
  const base = path.resolve(baseDir);
  const target = path.resolve(targetPath);
  const relative = path.relative(base, target);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * 清洗用户可控文件名，保留中文、英文、数字、空格和常见连接符。
 * 只返回单个文件名，不包含任何目录信息。
 */
export function sanitizeFileName(input: string, options: FileNameOptions = {}): string {
  const allowedExtensions = normalizeAllowedExtensions(options.allowedExtensions);
  const fallbackBaseName = options.fallbackBaseName || 'document';
  const maxLength = options.maxLength || 120;

  const rawInput = String(input || '').replace(/\0/g, '').trim();
  if (!rawInput || rawInput.includes('/') || rawInput.includes('\\') || path.isAbsolute(rawInput)) {
    throw new Error('非法文件名');
  }

  const rawBaseName = path.basename(rawInput);
  const ext = path.extname(rawBaseName).toLowerCase();

  if (allowedExtensions && !allowedExtensions.has(ext)) {
    throw new Error(`不支持的文件类型: ${ext || '无扩展名'}`);
  }

  const stem = path.basename(rawBaseName, ext)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();

  const safeStem = stem || fallbackBaseName;
  const reservedSafeStem = WINDOWS_RESERVED_NAMES.has(safeStem.toUpperCase())
    ? `${safeStem}_file`
    : safeStem;

  const maxStemLength = Math.max(1, maxLength - ext.length);
  return `${reservedSafeStem.slice(0, maxStemLength)}${ext}`;
}

export function safeTopicFileStem(topic: string, fallbackBaseName = 'document'): string {
  const safeTopic = String(topic || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeName = sanitizeFileName(`${safeTopic || fallbackBaseName}.docx`, {
    allowedExtensions: ['.docx'],
    fallbackBaseName,
    maxLength: 34,
  });
  return path.basename(safeName, '.docx');
}

export function formatTimestampForFile(date = new Date()): string {
  return date
    .toISOString()
    .slice(0, 23)
    .replace('T', '_')
    .replace(/:/g, '-')
    .replace('.', '-');
}

export function buildTimestampedDocumentStem(topic: string, suffix?: string): string {
  const parts = [formatTimestampForFile(), safeTopicFileStem(topic)];
  if (suffix) {
    const safeSuffix = String(suffix)
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (safeSuffix) {
      parts.push(safeSuffix);
    }
  }

  return `${parts.join('_')}_${randomUUID().slice(0, 8)}`;
}

export function resolveInsideDirectory(baseDir: string, fileName: string, options: FileNameOptions = {}): string {
  const safeName = sanitizeFileName(fileName, options);
  const realBaseDir = fs.realpathSync(baseDir);
  const resolved = path.resolve(realBaseDir, safeName);

  if (!isInsideDirectory(realBaseDir, resolved)) {
    throw new Error('非法文件路径');
  }

  return resolved;
}

export function resolveExistingFileInRoots(filePath: string, roots: string[]): string {
  const resolved = path.resolve(filePath);
  let realResolved: string;

  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    throw new Error('非法文件路径');
  }

  const allowed = roots.some(root => {
    try {
      return isInsideDirectory(fs.realpathSync(root), realResolved);
    } catch {
      return false;
    }
  });

  if (!allowed) {
    throw new Error('非法文件路径');
  }

  return realResolved;
}

export function ensureAllowedExtension(filePath: string, allowedExtensions: string[]): void {
  const allowed = normalizeAllowedExtensions(allowedExtensions);
  const ext = path.extname(filePath).toLowerCase();

  if (allowed && !allowed.has(ext)) {
    throw new Error(`不支持的文件类型: ${ext || '无扩展名'}`);
  }
}
