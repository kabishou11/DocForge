import * as path from 'path';
import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import {
  buildTimestampedDocumentStem,
  resolveExistingFileInRoots,
  resolveInsideDirectory,
  safeTopicFileStem,
  sanitizeFileName,
} from '../src/utils/path-safety';

describe('path safety helpers', () => {
  it('sanitizes document file names while preserving useful Chinese text', () => {
    expect(sanitizeFileName(' 项目方案:第一版?.docx ', {
      allowedExtensions: ['.docx'],
    })).toBe('项目方案_第一版_.docx');
  });

  it('rejects path traversal instead of silently remapping to a basename', () => {
    expect(() => sanitizeFileName('../secret.docx', {
      allowedExtensions: ['.docx'],
    })).toThrow('非法文件名');
  });

  it('rejects unsupported file extensions', () => {
    expect(() => sanitizeFileName('payload.exe', {
      allowedExtensions: ['.docx', '.md'],
    })).toThrow('不支持的文件类型');
  });

  it('resolves allowed files inside the target directory', () => {
    const root = path.resolve('templates');
    const resolved = resolveInsideDirectory(root, '模板.docx', {
      allowedExtensions: ['.docx'],
    });

    expect(resolved).toBe(path.resolve(fs.realpathSync(root), '模板.docx'));
  });

  it('does not allow sibling directories with the same path prefix', () => {
    const root = path.resolve('output');
    const sibling = path.join(`${root}-backup`, 'result.docx');

    expect(() => resolveExistingFileInRoots(sibling, [root])).toThrow('非法文件路径');
  });

  it('creates safe file stems from arbitrary topics', () => {
    const stem = safeTopicFileStem('2026/无锡:项目*方案?');

    expect(stem).not.toContain('/');
    expect(stem).not.toContain('\\');
    expect(stem).toContain('无锡');
  });

  it('builds timestamped document stems that stay readable and unique-looking', () => {
    const stem = buildTimestampedDocumentStem('智慧园区建设方案', 'from_template');

    expect(stem).toContain('智慧园区建设方案');
    expect(stem).toContain('from_template');
    expect(stem).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-\d{3}_.+_[0-9a-f]{8}$/);
  });
});
