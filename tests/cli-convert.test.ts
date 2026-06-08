import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { validateDocxWithPython } from '../src/services/python-docx';

const tempDirs: string[] = [];
const cliPath = path.resolve('bin', 'docforge.js');
const venvPython = path.resolve('.venv', 'Scripts', 'python.exe');
const canRunPythonDocx = fs.existsSync(venvPython);

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docforge-cli-convert-'));
  tempDirs.push(dir);
  return dir;
}

function runCli(args: string[], cwd = process.cwd()) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
  });
}

function readDocxEntry(docxPath: string, entryName: string): string {
  return execFileSync(
    venvPython,
    [
      '-c',
      'import sys, zipfile; sys.stdout.buffer.write(zipfile.ZipFile(sys.argv[1]).read(sys.argv[2]))',
      docxPath,
      entryName,
    ],
    { encoding: 'utf-8' }
  );
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('docforge convert CLI', () => {
  it('returns a non-zero exit code when the input file is missing', () => {
    const outputDir = createTempDir();
    const missingPath = path.join(outputDir, 'missing.md');

    const result = runCli(['convert', missingPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('文件不存在');
  });

  it('returns a non-zero exit code for unsupported input formats', () => {
    const outputDir = createTempDir();
    const inputPath = path.join(outputDir, 'source.html');
    fs.writeFileSync(inputPath, '<h1>不是 Markdown</h1>', 'utf-8');

    const result = runCli(['convert', inputPath]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('目前支持 .md/.markdown/.txt 输入');
  });

  (canRunPythonDocx ? it : it.skip)('converts Obsidian markdown into a valid DOCX file', async () => {
    const outputDir = createTempDir();
    const inputPath = path.join(outputDir, 'obsidian-note.md');
    const outputPath = path.join(outputDir, '交付文档.docx');

    fs.writeFileSync(
      inputPath,
      [
        '---',
        'tags: [proposal, final]',
        '---',
        '# 领导汇报材料',
        '',
        '这是从 Obsidian 直接转换的段落，包含 [[项目背景|项目背景别名]] 和 [外部链接](https://example.com/report)。',
        '',
        '> [!IMPORTANT] 关键判断',
        '> 当前方案已经具备进入 DOCX 交付链路的条件。',
        '',
        '- [ ] 核对附件',
        '- [x] 完成初稿',
        '',
        '| 模块 | 状态 |',
        '| --- | --- |',
        '| convert CLI | 已验证 |',
      ].join('\n'),
      'utf-8'
    );

    const result = runCli(['convert', inputPath, '--output', outputPath]);
    const validation = await validateDocxWithPython(outputPath);
    const documentXml = readDocxEntry(outputPath, 'word/document.xml');
    const relsXml = readDocxEntry(outputPath, 'word/_rels/document.xml.rels');

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DOCX 转换完成');
    expect(result.stdout).toContain(outputPath);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    expect(validation).toEqual({ valid: true, errors: [] });
    expect(documentXml).toContain('领导汇报材料');
    expect(documentXml).toContain('项目背景别名');
    expect(documentXml).toContain('关键判断');
    expect(documentXml).toContain('待办');
    expect(documentXml).toContain('完成');
    expect(documentXml).not.toContain('tags: [proposal, final]');
    expect(relsXml).toContain('https://example.com/report');
  });
});
