#!/usr/bin/env python3
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
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field, asdict

try:
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
    from docx.enum.style import WD_STYLE_TYPE
    from docx.oxml.ns import qn
except ImportError:
    print("请先安装依赖: pip install python-docx lxml")
    sys.exit(1)


@dataclass
class FontStyle:
    """字体样式"""
    name: str = "宋体"
    size: int = 12  # 磅值
    bold: bool = False
    italic: bool = False
    color_rgb: Optional[str] = None  # "#RRGGBB" 格式


@dataclass
class ParagraphStyle:
    """段落样式"""
    alignment: str = "left"  # left, center, right, justify
    line_spacing: float = 1.5
    space_before: int = 0  # 磅值
    space_after: int = 0  # 磅值
    indent_first_line: float = 0  # 英寸
    indent_left: float = 0  # 英寸


@dataclass
class DocStyleRules:
    """文档样式规则"""
    title: Dict = field(default_factory=lambda: {
        "font": {"name": "黑体", "size": 22, "bold": True},
        "paragraph": {"alignment": "center", "space_before": 400, "space_after": 300}
    })
    heading1: Dict = field(default_factory=lambda: {
        "font": {"name": "黑体", "size": 16, "bold": True},
        "paragraph": {"alignment": "left", "space_before": 300, "space_after": 150}
    })
    heading2: Dict = field(default_factory=lambda: {
        "font": {"name": "楷体", "size": 14, "bold": True},
        "paragraph": {"alignment": "left", "space_before": 250, "space_after": 100}
    })
    heading3: Dict = field(default_factory=lambda: {
        "font": {"name": "宋体", "size": 12, "bold": True},
        "paragraph": {"alignment": "left", "space_before": 200, "space_after": 80}
    })
    body: Dict = field(default_factory=lambda: {
        "font": {"name": "宋体", "size": 12, "bold": False},
        "paragraph": {
            "alignment": "justify",
            "line_spacing": 1.5,
            "space_before": 0,
            "space_after": 80,
            "indent_first_line": 0.35  # 首行缩进2字符
        }
    })
    list: Dict = field(default_factory=lambda: {
        "font": {"name": "宋体", "size": 12, "bold": False},
        "paragraph": {"alignment": "left", "space_before": 60, "space_after": 60}
    })
    quote: Dict = field(default_factory=lambda: {
        "font": {"name": "楷体", "size": 12, "italic": True},
        "paragraph": {
            "alignment": "left",
            "indent_left": 0.5,
            "space_before": 100,
            "space_after": 100
        }
    })
    code: Dict = field(default_factory=lambda: {
        "font": {"name": "Consolas", "size": 11},
        "paragraph": {"alignment": "left", "indent_left": 0.5, "space_before": 150, "space_after": 150}
    })
    page_margin: Dict = field(default_factory=lambda: {
        "top": 1.0, "bottom": 1.0, "left": 1.0, "right": 1.0  # 英寸
    })


def hex_to_rgb(hex_color: str) -> Optional[RGBColor]:
    """HEX 颜色转 RGBColor"""
    if not hex_color:
        return None
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        return RGBColor(int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16))
    return None


def inches_from_pt(pt: float) -> float:
    """磅值转英寸 (1英寸=72磅)"""
    return pt / 72.0


def apply_font(paragraph, font_style: Dict, is_title: bool = False):
    """应用字体样式"""
    font = paragraph.font
    font_name = font_style.get("name", "宋体")
    font_size = font_style.get("size", 12)
    font_bold = font_style.get("bold", False)
    font_italic = font_style.get("italic", False)
    font_color = font_style.get("color")

    font.name = font_name
    font.size = Pt(font_size)
    font.bold = font_bold
    font.italic = font_italic

    if font_color:
        rgb = hex_to_rgb(font_color)
        if rgb:
            font.color.rgb = rgb

    # 标题需要更大的字号
    if is_title and font_size < 16:
        font.size = Pt(font_size + 6)


def apply_paragraph_style(paragraph, para_style: Dict, is_body: bool = False):
    """应用段落样式"""
    alignment_map = {
        "left": WD_ALIGN_PARAGRAPH.LEFT,
        "center": WD_ALIGN_PARAGRAPH.CENTER,
        "right": WD_ALIGN_PARAGRAPH.RIGHT,
        "justify": WD_ALIGN_PARAGRAPH.JUSTIFY,
        "distribute": WD_ALIGN_PARAGRAPH.DISTRIBUTE
    }

    # 对齐方式
    align = para_style.get("alignment", "left")
    paragraph.alignment = alignment_map.get(align, WD_ALIGN_PARAGRAPH.LEFT)

    # 行距
    line_spacing = para_style.get("line_spacing", 1.5)
    if line_spacing:
        paragraph.paragraph_format.line_spacing = Pt(line_spacing * 12)  # 约1.5倍行距

    # 段前段后
    space_before = para_style.get("space_before", 0)
    space_after = para_style.get("space_after", 0)
    if space_before:
        paragraph.paragraph_format.space_before = Pt(space_before)
    if space_after:
        paragraph.paragraph_format.space_after = Pt(space_after)

    # 首行缩进
    if is_body:
        indent = para_style.get("indent_first_line", 0.35)
        if indent:
            paragraph.paragraph_format.first_line_indent = Inches(indent)


def parse_markdown_element(line: str) -> tuple:
    """解析 Markdown 元素类型"""
    line = line.strip()

    # 标题检测（按顺序，从长到短）
    if line.startswith('### '):
        return ('heading3', line[4:])
    if line.startswith('## '):
        return ('heading2', line[3:])
    if line.startswith('# '):
        return ('title', line[2:])

    # 列表检测
    if re.match(r'^[-*]\s', line):
        return ('list', re.sub(r'^[-*]\s', '', line))
    if re.match(r'^\d+\.\s', line):
        return ('list', re.sub(r'^\d+\.\s', '', line))

    # 引用检测
    if line.startswith('>'):
        return ('quote', line[1:].strip())

    # 代码块开始
    if line.startswith('```'):
        return ('code_start', line[3:].strip())

    # 分隔线
    if re.match(r'^[-*]{3,}$', line):
        return ('hr', '')

    # 普通段落
    return ('body', line)


def parse_markdown(markdown: str) -> List[Dict]:
    """解析 Markdown 为元素列表"""
    elements = []
    lines = markdown.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].rstrip()

        if not line:
            i += 1
            continue

        elem_type, content = parse_markdown_element(line)

        if elem_type == 'code_start':
            # 收集代码块内容
            code_content = ''
            i += 1
            while i < len(lines) and not lines[i].startswith('```'):
                code_content += lines[i] + '\n'
                i += 1
            elements.append({'type': 'code', 'content': code_content.strip()})
            i += 1
            continue

        if elem_type == 'table':
            # 收集表格
            table_data = []
            while i < len(lines) and '|' in lines[i]:
                row = [c.strip() for c in lines[i].split('|')]
                if len(row) > 1 and not all(c.startswith('-') or c.startswith(':') for c in row):
                    table_data.append(row)
                i += 1
            elements.append({'type': 'table', 'data': table_data})
            continue

        elements.append({'type': elem_type, 'content': content})
        i += 1

    return elements


def create_element(doc: Document, elem: Dict, style_rules: DocStyleRules):
    """创建文档元素"""
    elem_type = elem['type']
    content = elem.get('content', '')

    if elem_type == 'title':
        p = doc.add_paragraph()
        p.style = doc.styles['Title']
        apply_font(p, style_rules.title["font"], is_title=True)
        apply_paragraph_style(p, style_rules.title["paragraph"])
        run = p.add_run(content)
        apply_font(p, style_rules.title["font"], is_title=True)

    elif elem_type == 'heading1':
        p = doc.add_paragraph()
        p.style = doc.styles['Heading 1']
        apply_font(p, style_rules.heading1["font"])
        apply_paragraph_style(p, style_rules.heading1["paragraph"])
        p.add_run(content)

    elif elem_type == 'heading2':
        p = doc.add_paragraph()
        p.style = doc.styles['Heading 2']
        apply_font(p, style_rules.heading2["font"])
        apply_paragraph_style(p, style_rules.heading2["paragraph"])
        p.add_run(content)

    elif elem_type == 'heading3':
        p = doc.add_paragraph()
        p.style = doc.styles['Heading 3']
        apply_font(p, style_rules.heading3["font"])
        apply_paragraph_style(p, style_rules.heading3["paragraph"])
        p.add_run(content)

    elif elem_type == 'body':
        p = doc.add_paragraph()
        apply_font(p, style_rules.body["font"])
        apply_paragraph_style(p, style_rules.body["paragraph"], is_body=True)
        p.add_run(content)

    elif elem_type == 'list':
        p = doc.add_paragraph()
        apply_font(p, style_rules.list["font"])
        apply_paragraph_style(p, style_rules.list["paragraph"])
        # 添加列表符号
        run = p.add_run('• ')
        p.add_run(content)

    elif elem_type == 'quote':
        p = doc.add_paragraph()
        apply_font(p, style_rules.quote["font"])
        apply_paragraph_style(p, style_rules.quote["paragraph"])
        # 添加左边框
        p.paragraph_format.left_indent = Inches(0.5)
        p.add_run(content)

    elif elem_type == 'code':
        p = doc.add_paragraph()
        apply_font(p, style_rules.code["font"])
        apply_paragraph_style(p, style_rules.code["paragraph"])
        p.paragraph_format.left_indent = Inches(0.5)
        p.add_run(content)

    elif elem_type == 'hr':
        p = doc.add_paragraph()
        p.add_run('─' * 30)

    elif elem_type == 'table':
        create_table(doc, elem['data'], style_rules)


def create_table(doc: Document, table_data: List[List[str]], style_rules: DocStyleRules):
    """创建表格"""
    if not table_data:
        return

    rows = len(table_data)
    cols = max(len(row) for row in table_data)

    table = doc.add_table(rows=rows, cols=cols)
    table.style = 'Table Grid'

    for i, row_data in enumerate(table_data):
        for j, cell_text in enumerate(row_data):
            cell = table.cell(i, j)
            cell.text = cell_text
            paragraph = cell.paragraphs[0]

            # 表头样式
            if i == 0:
                apply_font(paragraph, {"name": "宋体", "size": 12, "bold": True})
                shading = cell._tc.get_or_add_tcPr()
                shading.append(doc._element.from_xml(
                    '<w:shd {} w:fill="E6E6E6"/>'.format(
                        'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
                    )
                ))
            else:
                apply_font(paragraph, style_rules.body["font"])

            paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER


def extract_styles_from_docx(docx_path: str) -> Dict:
    """从 DOCX 模板提取样式规则"""
    rules = DocStyleRules()

    try:
        doc = Document(docx_path)

        # 提取默认段落样式
        doc_default = doc.styles['Normal']
        if doc_default:
            font = doc_default.font
            if font.name:
                rules.body["font"]["name"] = font.name
            if font.size:
                rules.body["font"]["size"] = int(font.size.pt)

        # 提取标题样式
        for heading_level in ['Heading 1', 'Heading 2', 'Heading 3']:
            heading = doc.styles.get(heading_level)
            if heading:
                heading_font = heading.font
                key = heading_level.lower().replace(' ', '')
                if heading_font.name:
                    rules.__dict__[key]["font"]["name"] = heading_font.name
                if heading_font.size:
                    rules.__dict__[key]["font"]["size"] = int(heading_font.size.pt)

        # 提取页面设置
        section = doc.sections[0] if doc.sections else None
        if section:
            rules.page_margin["top"] = section.top_margin.inches
            rules.page_margin["bottom"] = section.bottom_margin.inches
            rules.page_margin["left"] = section.left_margin.inches
            rules.page_margin["right"] = section.right_margin.inches

    except Exception as e:
        print(f"警告: 无法解析模板样式，使用默认值: {e}")

    return asdict(rules)


def markdown_to_docx(markdown: str, output_path: str, style_rules: Optional[Dict] = None):
    """将 Markdown 转换为带样式的 DOCX"""
    # 使用默认样式或传入的样式
    if style_rules is None:
        style_rules = asdict(DocStyleRules())

    # 创建文档
    doc = Document()

    # 设置页面边距
    if "page_margin" in style_rules:
        margin = style_rules["page_margin"]
        section = doc.sections[0]
        section.top_margin = Inches(margin.get("top", 1.0))
        section.bottom_margin = Inches(margin.get("bottom", 1.0))
        section.left_margin = Inches(margin.get("left", 1.0))
        section.right_margin = Inches(margin.get("right", 1.0))

    # 解析 Markdown
    elements = parse_markdown(markdown)

    # 创建样式规则对象
    rules = DocStyleRules(**style_rules)

    # 添加元素
    for elem in elements:
        create_element(doc, elem, rules)

    # 保存文档
    doc.save(output_path)
    return output_path


def main():
    """命令行入口"""
    if len(sys.argv) < 3:
        print("用法:")
        print("  提取样式: python docforge_py.py extract <input.docx> <output.json>")
        print("  生成文档: python docforge_py.py generate <input.md> <output.docx> [--style <style.json>]")
        sys.exit(1)

    command = sys.argv[1]

    if command == "extract":
        if len(sys.argv) < 4:
            print("错误: 需要指定输出文件")
            sys.exit(1)
        docx_path = sys.argv[2]
        output_path = sys.argv[3]

        if not os.path.exists(docx_path):
            print(f"错误: 文件不存在: {docx_path}")
            sys.exit(1)

        styles = extract_styles_from_docx(docx_path)

        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(styles, f, ensure_ascii=False, indent=2)

        print(f"样式已提取到: {output_path}")

    elif command == "generate":
        if len(sys.argv) < 4:
            print("错误: 需要指定输出文件")
            sys.exit(1)

        md_path = sys.argv[2]
        output_path = sys.argv[3]

        # 解析选项
        style_file = None
        for i in range(4, len(sys.argv)):
            if sys.argv[i] == "--style" and i + 1 < len(sys.argv):
                style_file = sys.argv[i + 1]

        if not os.path.exists(md_path):
            print(f"错误: 文件不存在: {md_path}")
            sys.exit(1)

        # 读取 Markdown
        with open(md_path, 'r', encoding='utf-8') as f:
            markdown = f.read()

        # 读取样式
        style_rules = None
        if style_file and os.path.exists(style_file):
            with open(style_file, 'r', encoding='utf-8') as f:
                style_rules = json.load(f)

        # 生成 DOCX
        result_path = markdown_to_docx(markdown, output_path, style_rules)
        print(f"DOCX 已生成: {result_path}")

    else:
        print(f"未知命令: {command}")
        sys.exit(1)


if __name__ == "__main__":
    main()
