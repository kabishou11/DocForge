import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { generateDocxWithPython, validateDocxWithPython } from '../src/services/python-docx';

const tempDirs: string[] = [];
const venvPython = path.resolve('.venv', 'Scripts', 'python.exe');
const canRunPythonDocx = fs.existsSync(venvPython);

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docforge-docx-'));
  tempDirs.push(dir);
  return dir;
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

describe('python-docx wrapper', () => {
  (canRunPythonDocx ? it : it.skip)('generates a valid DOCX package from markdown', async () => {
    const outputDir = createTempDir();
    const outputPath = path.join(outputDir, 'result.docx');

    await generateDocxWithPython({
      markdown: [
        '# 交付测试',
        '',
        '这是一个用于验证 DOCX 生成链路的段落。',
        '',
        '1. 第一项',
        '2. 第二项',
      ].join('\n'),
      outputPath,
      addTimestamp: true,
    });

    const validation = await validateDocxWithPython(outputPath);

    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    expect(validation).toEqual({ valid: true, errors: [] });
  });

  (canRunPythonDocx ? it : it.skip)('turns Obsidian markdown into delivery-ready Word structures', async () => {
    const outputDir = createTempDir();
    const outputPath = path.join(outputDir, 'obsidian.docx');

    await generateDocxWithPython({
      markdown: [
        '---',
        'tags: [draft]',
        '---',
        '# Obsidian 交付测试',
        '',
        '## 一、项目背景',
        '',
        '### （一）建设基础',
        '',
        '这是一个包含 [[内部资料|内部资料别名]]、[官网](https://example.com) 和脚注[^1] 的段落。',
        '',
        '> [!WARNING] 风险提示',
        '> 这里是需要领导关注的风险。',
        '',
        '- [ ] 梳理需求',
        '- [x] 完成初稿',
        '  - 嵌套列表',
        '',
        '| 项目 | 状态 |',
        '| --- | --- |',
        '| 链接 | [查看](https://example.com/a) |',
        '',
        '[^1]: 这是一条 Obsidian 脚注。',
      ].join('\n'),
      outputPath,
    });

    const documentXml = readDocxEntry(outputPath, 'word/document.xml');
    const relsXml = readDocxEntry(outputPath, 'word/_rels/document.xml.rels');
    const settingsXml = readDocxEntry(outputPath, 'word/settings.xml');

    // 标题使用 Word 原生样式
    expect(documentXml).toContain('Obsidian 交付测试');
    expect(documentXml).toContain('w:pStyle w:val="Title"');
    expect(documentXml).toContain('w:pStyle w:val="Heading1"');
    expect(documentXml).toContain('w:pStyle w:val="Heading2"');

    // 大纲级别（导航窗格/TOC 依赖）
    expect(documentXml).toContain('w:outlineLvl w:val="0"');
    expect(documentXml).toContain('w:outlineLvl w:val="1"');

    // 目录域
    expect(documentXml).toContain('TOC \\o "1-3" \\h \\z \\u');

    // Obsidian 降噪：内部链接保留别名
    expect(documentXml).toContain('内部资料别名');
    expect(documentXml).not.toContain('tags: [draft]');

    // Callout
    expect(documentXml).toContain('风险提示');

    // 任务列表
    expect(documentXml).toContain('待办');
    expect(documentXml).toContain('完成');

    // Word 原生脚注：正文中有 footnoteReference
    expect(documentXml).toContain('w:footnoteReference');
    // 脚注内容在 footnotes.xml 中
    const footnotesXml = readDocxEntry(outputPath, 'word/footnotes.xml');
    expect(footnotesXml).toContain('这是一条 Obsidian 脚注');

    // Word 原生编号列表：使用 w:numPr 而非 pStyle
    expect(documentXml).toContain('w:numPr');
    expect(documentXml).toContain('w:numId');

    // 表格：tblGrid + tblGridCol + 表头重复
    expect(documentXml).toContain('w:tblGrid');
    expect(documentXml).toContain('w:gridCol');
    expect(documentXml).toContain('w:tblHeader');

    // 外链在 rels 中
    expect(relsXml).toContain('https://example.com');

    // 打开时更新域
    expect(settingsXml).toContain('w:updateFields w:val="true"');
  });

  (canRunPythonDocx ? it : it.skip)('does not resolve image references outside the asset root', async () => {
    const outputDir = createTempDir();
    const assetRoot = path.join(outputDir, 'vault');
    fs.mkdirSync(assetRoot, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'secret.png'), 'not actually an image', 'utf-8');

    const outputPath = path.join(outputDir, 'asset-boundary.docx');
    await generateDocxWithPython({
      markdown: [
        '# 图片边界测试',
        '',
        '![敏感图](../secret.png)',
      ].join('\n'),
      outputPath,
      assetRoot,
    });

    const documentXml = readDocxEntry(outputPath, 'word/document.xml');
    expect(documentXml).toContain('图片未嵌入');
    expect(documentXml).toContain('../secret.png');
    expect(documentXml).not.toContain('图片嵌入失败');
  });
});
