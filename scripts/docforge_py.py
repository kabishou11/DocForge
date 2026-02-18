#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DocForge Python 文档处理器
功能：
1. 从 DOCX 模板提取样式规则
2. 将 Markdown 转换为带模板样式的 DOCX
"""

import sys
import json
import re
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field, asdict

try:
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor, Emu
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    import lxml.etree as etree
except ImportError:
    print("请先安装依赖: pip install python-docx lxml", file=sys.stderr)
    sys.exit(1)


# ─────────────────────────────────────────────
# 样式数据结构
# ─────────────────────────────────────────────

def default_style_rules() -> dict:
    return {
        "title": {
            "font": {"name": "黑体", "size": 22, "bold": True, "italic": False},
            "paragraph": {"alignment": "center", "space_before": 12, "space_after": 6, "line_spacing": 1.5}
        },
        "heading1": {
            "font": {"name": "黑体", "size": 16, "bold": True, "italic": False},
            "paragraph": {"alignment": "left", "space_before": 12, "space_after": 6, "line_spacing": 1.5}
        },
        "heading2": {
            "font": {"name": "楷体", "size": 14, "bold": True, "italic": False},
            "paragraph": {"alignment": "left", "space_before": 10, "space_after": 4, "line_spacing": 1.5}
        },
        "heading3": {
            "font": {"name": "宋体", "size": 12, "bold": True, "italic": False},
            "paragraph": {"alignment": "left", "space_before": 8, "space_after": 4, "line_spacing": 1.5}
        },
        "body": {
            "font": {"name": "宋体", "size": 12, "bold": False, "italic": False},
            "paragraph": {
                "alignment": "justify",
                "space_before": 0,
                "space_after": 4,
                "line_spacing": 1.5,
                "indent_first_line": 0.35
            }
        },
        "list": {
            "font": {"name": "宋体", "size": 12, "bold": False, "italic": False},
            "paragraph": {"alignment": "left", "space_before": 2, "space_after": 2, "line_spacing": 1.5}
        },
        "quote": {
            "font": {"name": "楷体", "size": 11, "bold": False, "italic": True},
            "paragraph": {"alignment": "left", "space_before": 4, "space_after": 4, "line_spacing": 1.5, "indent_left": 0.4}
        },
        "code": {
            "font": {"name": "Consolas", "size": 10, "bold": False, "italic": False},
            "paragraph": {"alignment": "left", "space_before": 6, "space_after": 6, "line_spacing": 1.2, "indent_left": 0.4}
        },
        "page_margin": {"top": 1.0, "bottom": 1.0, "left": 1.25, "right": 1.25}
    }


# ─────────────────────────────────────────────
# 字体工具
# ─────────────────────────────────────────────

def set_run_font(run, font_name: str, size_pt: float, bold: bool = False, italic: bool = False, color_hex: str = None):
    """设置 run 的字体，正确处理中文字体"""
    run.font.size = Pt(size_pt)
    run.font.bold = bold
    run.font.italic = italic

    if color_hex:
        color_hex = color_hex.lstrip('#')
        if len(color_hex) == 6:
            run.font.color.rgb = RGBColor(
                int(color_hex[0:2], 16),
                int(color_hex[2:4], 16),
                int(color_hex[4:6], 16)
            )

    # 设置字体名称（同时设置 ASCII 和东亚字体）
    run.font.name = font_name
    rPr = run._r.get_or_add_rPr()

    # 设置东亚字体（中文）
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.insert(0, rFonts)

    rFonts.set(qn('w:ascii'), font_name)
    rFonts.set(qn('w:hAnsi'), font_name)
    rFonts.set(qn('w:eastAsia'), font_name)
    rFonts.set(qn('w:cs'), font_name)


def set_paragraph_format(para, style_cfg: dict):
    """设置段落格式"""
    pf = para.paragraph_format

    alignment_map = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
    }
    align = style_cfg.get("alignment", "left")
    para.alignment = alignment_map.get(align, WD_ALIGN_PARAGRAPH.LEFT)

    space_before = style_cfg.get("space_before", 0)
    space_after = style_cfg.get("space_after", 0)
    if space_before is not None:
        pf.space_before = Pt(space_before)
    if space_after is not None:
        pf.space_after = Pt(space_after)

    line_spacing = style_cfg.get("line_spacing", 1.5)
    if line_spacing:
        pf.line_spacing = line_spacing          # float = 倍数行距
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE

    indent_first = style_cfg.get("indent_first_line", 0)
    if indent_first:
        pf.first_line_indent = Inches(indent_first)

    indent_left = style_cfg.get("indent_left", 0)
    if indent_left:
        pf.left_indent = Inches(indent_left)


# ─────────────────────────────────────────────
# Markdown 解析
# ─────────────────────────────────────────────

def parse_inline(text: str) -> List[Tuple[str, dict]]:
    """解析行内格式，返回 (text, attrs) 列表"""
    result = []
    # 处理 **bold**, *italic*, `code`
    pattern = re.compile(r'(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|(.+?)(?=\*\*|\*|`|$))', re.DOTALL)
    pos = 0
    while pos < len(text):
        # 粗体
        m = re.match(r'\*\*(.+?)\*\*', text[pos:], re.DOTALL)
        if m:
            result.append((m.group(1), {'bold': True}))
            pos += m.end()
            continue
        # 斜体
        m = re.match(r'\*(.+?)\*', text[pos:], re.DOTALL)
        if m:
            result.append((m.group(1), {'italic': True}))
            pos += m.end()
            continue
        # 行内代码
        m = re.match(r'`(.+?)`', text[pos:], re.DOTALL)
        if m:
            result.append((m.group(1), {'code': True}))
            pos += m.end()
            continue
        # 普通文本（到下一个特殊字符）
        m = re.match(r'(.+?)(?=\*\*|\*|`|$)', text[pos:], re.DOTALL)
        if m and m.group(1):
            result.append((m.group(1), {}))
            pos += m.end()
        else:
            if pos < len(text):
                result.append((text[pos:], {}))
            break
    return result if result else [(text, {})]


def parse_markdown(markdown: str) -> List[dict]:
    """解析 Markdown 为元素列表"""
    elements = []
    lines = markdown.split('\n')
    i = 0
    in_code_block = False
    code_content = []
    code_lang = ''

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # 代码块
        if stripped.startswith('```'):
            if not in_code_block:
                in_code_block = True
                code_lang = stripped[3:].strip()
                code_content = []
            else:
                in_code_block = False
                elements.append({'type': 'code', 'content': '\n'.join(code_content), 'lang': code_lang})
                code_content = []
                code_lang = ''
            i += 1
            continue

        if in_code_block:
            code_content.append(line)
            i += 1
            continue

        # 空行
        if not stripped:
            i += 1
            continue

        # 标题
        if stripped.startswith('#### '):
            elements.append({'type': 'heading4', 'content': stripped[5:]})
        elif stripped.startswith('### '):
            elements.append({'type': 'heading3', 'content': stripped[4:]})
        elif stripped.startswith('## '):
            elements.append({'type': 'heading2', 'content': stripped[3:]})
        elif stripped.startswith('# '):
            elements.append({'type': 'title', 'content': stripped[2:]})

        # 分隔线
        elif re.match(r'^[-*_]{3,}$', stripped):
            elements.append({'type': 'hr'})

        # 引用
        elif stripped.startswith('>'):
            content = stripped[1:].strip()
            elements.append({'type': 'quote', 'content': content})

        # 无序列表
        elif re.match(r'^[-*+]\s', stripped):
            content = re.sub(r'^[-*+]\s+', '', stripped)
            elements.append({'type': 'list_item', 'content': content, 'ordered': False})

        # 有序列表
        elif re.match(r'^\d+\.\s', stripped):
            content = re.sub(r'^\d+\.\s+', '', stripped)
            elements.append({'type': 'list_item', 'content': content, 'ordered': True})

        # 表格
        elif '|' in stripped and stripped.startswith('|'):
            # 收集表格行
            table_rows = []
            while i < len(lines) and '|' in lines[i].strip() and lines[i].strip().startswith('|'):
                row_line = lines[i].strip()
                # 跳过分隔行（如 |---|---|）
                if re.match(r'^\|[\s\-:]+\|', row_line):
                    i += 1
                    continue
                cells = [c.strip() for c in row_line.strip('|').split('|')]
                table_rows.append(cells)
                i += 1
            if table_rows:
                elements.append({'type': 'table', 'rows': table_rows})
            continue

        # 普通段落
        else:
            elements.append({'type': 'body', 'content': stripped})

        i += 1

    return elements


# ─────────────────────────────────────────────
# DOCX 元素创建
# ─────────────────────────────────────────────

def add_paragraph_with_style(doc: Document, content: str, style_key: str, rules: dict) -> None:
    """添加带样式的段落"""
    style_cfg = rules.get(style_key, rules['body'])
    font_cfg = style_cfg.get('font', {})
    para_cfg = style_cfg.get('paragraph', {})

    para = doc.add_paragraph()
    set_paragraph_format(para, para_cfg)

    # 标题：与下段保持同页，防止孤立标题
    if style_key in ('title', 'heading1', 'heading2', 'heading3'):
        para.paragraph_format.keep_with_next = True

    # 解析行内格式
    inline_parts = parse_inline(content)
    for text, attrs in inline_parts:
        if not text:
            continue
        run = para.add_run(text)
        font_name = 'Consolas' if attrs.get('code') else font_cfg.get('name', '宋体')
        font_size = 10 if attrs.get('code') else font_cfg.get('size', 12)
        is_bold = attrs.get('bold', font_cfg.get('bold', False))
        is_italic = attrs.get('italic', font_cfg.get('italic', False))
        set_run_font(run, font_name, font_size, bold=is_bold, italic=is_italic)


def add_quote_paragraph(doc: Document, content: str, rules: dict) -> None:
    """添加引用段落（带左边框）"""
    style_cfg = rules.get('quote', rules['body'])
    font_cfg = style_cfg.get('font', {})
    para_cfg = style_cfg.get('paragraph', {})

    para = doc.add_paragraph()
    set_paragraph_format(para, para_cfg)

    run = para.add_run(content)
    set_run_font(run, font_cfg.get('name', '楷体'), font_cfg.get('size', 11),
                 bold=font_cfg.get('bold', False), italic=font_cfg.get('italic', True))

    # 添加左边框
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    left = OxmlElement('w:left')
    left.set(qn('w:val'), 'single')
    left.set(qn('w:sz'), '6')
    left.set(qn('w:space'), '4')
    left.set(qn('w:color'), '888888')
    pBdr.append(left)
    pPr.append(pBdr)

    # 灰色背景
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), 'F5F5F5')
    pPr.append(shd)


def add_code_paragraph(doc: Document, content: str, rules: dict) -> None:
    """添加代码块段落"""
    style_cfg = rules.get('code', rules['body'])
    font_cfg = style_cfg.get('font', {})
    para_cfg = style_cfg.get('paragraph', {})

    for line in content.split('\n'):
        para = doc.add_paragraph()
        set_paragraph_format(para, para_cfg)

        run = para.add_run(line if line else ' ')
        set_run_font(run, font_cfg.get('name', 'Consolas'), font_cfg.get('size', 10))

        # 灰色背景
        pPr = para._p.get_or_add_pPr()
        shd = OxmlElement('w:shd')
        shd.set(qn('w:val'), 'clear')
        shd.set(qn('w:color'), 'auto')
        shd.set(qn('w:fill'), 'F0F0F0')
        pPr.append(shd)


def add_table(doc: Document, rows: List[List[str]], rules: dict) -> None:
    """添加表格"""
    if not rows:
        return

    num_cols = max(len(row) for row in rows)
    table = doc.add_table(rows=len(rows), cols=num_cols)
    table.style = 'Table Grid'

    body_cfg = rules.get('body', {})
    font_cfg = body_cfg.get('font', {})

    for i, row_data in enumerate(rows):
        row = table.rows[i]
        for j, cell_text in enumerate(row_data):
            if j >= num_cols:
                break
            cell = row.cells[j]
            cell.text = ''
            para = cell.paragraphs[0]
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER

            run = para.add_run(cell_text)
            is_header = (i == 0)
            set_run_font(run, font_cfg.get('name', '宋体'), font_cfg.get('size', 12), bold=is_header)

            # 表头背景
            if is_header:
                tc = cell._tc
                tcPr = tc.get_or_add_tcPr()
                shd = OxmlElement('w:shd')
                shd.set(qn('w:val'), 'clear')
                shd.set(qn('w:color'), 'auto')
                shd.set(qn('w:fill'), 'DAEEF3')
                tcPr.append(shd)


# ─────────────────────────────────────────────
# 主要功能
# ─────────────────────────────────────────────

def extract_styles_from_docx(docx_path: str) -> dict:
    """从 DOCX 模板提取样式规则"""
    rules = default_style_rules()

    try:
        doc = Document(docx_path)

        # 提取正文默认样式
        try:
            normal = doc.styles['Normal']
            if normal.font.name:
                rules['body']['font']['name'] = normal.font.name
            if normal.font.size:
                rules['body']['font']['size'] = round(normal.font.size.pt)
        except Exception:
            pass

        # 提取标题样式
        heading_map = {
            'Heading 1': 'heading1',
            'Heading 2': 'heading2',
            'Heading 3': 'heading3',
        }
        for word_style, key in heading_map.items():
            try:
                style = doc.styles[word_style]
                if style.font.name:
                    rules[key]['font']['name'] = style.font.name
                if style.font.size:
                    rules[key]['font']['size'] = round(style.font.size.pt)
                if style.font.bold is not None:
                    rules[key]['font']['bold'] = style.font.bold
            except Exception:
                pass

        # 提取页面边距
        try:
            section = doc.sections[0]
            rules['page_margin']['top'] = round(section.top_margin.inches, 2)
            rules['page_margin']['bottom'] = round(section.bottom_margin.inches, 2)
            rules['page_margin']['left'] = round(section.left_margin.inches, 2)
            rules['page_margin']['right'] = round(section.right_margin.inches, 2)
        except Exception:
            pass

    except Exception as e:
        print(f"警告: 无法解析模板样式，使用默认值: {e}", file=sys.stderr)

    return rules


def markdown_to_docx(markdown: str, output_path: str, style_rules: Optional[dict] = None) -> str:
    """将 Markdown 转换为带样式的 DOCX"""
    rules = style_rules if style_rules else default_style_rules()

    doc = Document()

    # 设置页面边距
    margin = rules.get('page_margin', {})
    section = doc.sections[0]
    section.top_margin = Inches(margin.get('top', 1.0))
    section.bottom_margin = Inches(margin.get('bottom', 1.0))
    section.left_margin = Inches(margin.get('left', 1.25))
    section.right_margin = Inches(margin.get('right', 1.25))

    # 解析 Markdown
    elements = parse_markdown(markdown)

    for elem in elements:
        etype = elem['type']

        if etype == 'title':
            add_paragraph_with_style(doc, elem['content'], 'title', rules)

        elif etype == 'heading2':
            add_paragraph_with_style(doc, elem['content'], 'heading1', rules)

        elif etype == 'heading3':
            add_paragraph_with_style(doc, elem['content'], 'heading2', rules)

        elif etype == 'heading4':
            add_paragraph_with_style(doc, elem['content'], 'heading3', rules)

        elif etype == 'body':
            add_paragraph_with_style(doc, elem['content'], 'body', rules)

        elif etype == 'list_item':
            style_cfg = rules.get('list', rules['body'])
            font_cfg = style_cfg.get('font', {})
            para_cfg = dict(style_cfg.get('paragraph', {}))
            para_cfg['indent_left'] = 0.3
            para_cfg['indent_first_line'] = 0

            para = doc.add_paragraph()
            set_paragraph_format(para, para_cfg)

            bullet = '• ' if not elem.get('ordered') else ''
            run = para.add_run(bullet + elem['content'])
            set_run_font(run, font_cfg.get('name', '宋体'), font_cfg.get('size', 12))

        elif etype == 'quote':
            add_quote_paragraph(doc, elem['content'], rules)

        elif etype == 'code':
            add_code_paragraph(doc, elem['content'], rules)

        elif etype == 'table':
            add_table(doc, elem['rows'], rules)

        elif etype == 'hr':
            para = doc.add_paragraph()
            run = para.add_run('─' * 40)
            run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

    doc.save(output_path)
    return output_path


# ─────────────────────────────────────────────
# 命令行入口
# ─────────────────────────────────────────────

def main():
    if len(sys.argv) < 3:
        print("用法:", file=sys.stderr)
        print("  提取样式: python docforge_py.py extract <input.docx> <output.json>", file=sys.stderr)
        print("  生成文档: python docforge_py.py generate <input.md> <output.docx> [--style <style.json>]", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1]

    if command == "extract":
        if len(sys.argv) < 4:
            print("错误: 需要指定输出文件", file=sys.stderr)
            sys.exit(1)
        docx_path = sys.argv[2]
        output_path = sys.argv[3]

        if not os.path.exists(docx_path):
            print(f"错误: 文件不存在: {docx_path}", file=sys.stderr)
            sys.exit(1)

        styles = extract_styles_from_docx(docx_path)
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(styles, f, ensure_ascii=False, indent=2)
        print(f"样式已提取到: {output_path}")

    elif command == "generate":
        if len(sys.argv) < 4:
            print("错误: 需要指定输出文件", file=sys.stderr)
            sys.exit(1)

        md_path = sys.argv[2]
        output_path = sys.argv[3]

        style_file = None
        for i in range(4, len(sys.argv)):
            if sys.argv[i] == "--style" and i + 1 < len(sys.argv):
                style_file = sys.argv[i + 1]

        if not os.path.exists(md_path):
            print(f"错误: 文件不存在: {md_path}", file=sys.stderr)
            sys.exit(1)

        with open(md_path, 'r', encoding='utf-8') as f:
            markdown = f.read()

        style_rules = None
        if style_file and os.path.exists(style_file):
            with open(style_file, 'r', encoding='utf-8') as f:
                style_rules = json.load(f)

        result_path = markdown_to_docx(markdown, output_path, style_rules)
        print(f"DOCX 已生成: {result_path}")

    else:
        print(f"未知命令: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
