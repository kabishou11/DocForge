# DocForge 项目文档（持续学习版）

> 本文档会随着项目演进不断更新和迭代，记录最佳实践、问题解决方案和已知限制。

---

## 项目概述

DocForge 是一个基于 AI 的专业文档生成系统，支持从模板生成格式规范、可直接呈报的文档。

**核心价值**: 让 AI 生成的内容能够直接给领导看，无需手动排版。

---

## 架构设计（简化版）

### 核心流程

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DocForge 简化处理流程                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  【阶段1: OCR 提取样式】                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ DOCX模板  │───>│  Mammoth │───>│ 样式规则  │                      │
│  │          │    │ 提取文本  │    │ StyleRules│                     │
│  └──────────┘    └──────────┘    └──────────┘                      │
│                                                                      │
│  【阶段2: LLM 生成内容】                                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ 模板内容  │───>│   LLM    │───>│ Markdown │                      │
│  │ +样式规范 │    │ 生成内容  │    │          │                      │
│  └──────────┘    └──────────┘    └──────────┘                      │
│                                                                      │
│  【阶段3: 文档合成】                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │ Markdown │───>│ Document │───>│ DOCX    │                      │
│  │          │    │ Synthesizer│          │                      │
│  └──────────┘    └──────────┘    └──────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 模型使用（简化版）

| 阶段 | 模型 | 作用 |
|------|------|------|
| 样式提取 | OCR 模型 | 提取 DOCX 模板的样式规则 |
| 内容生成 | LLM 模型 | 基于模板风格生成新内容 |
| 格式还原 | DocumentSynthesizer | 应用样式生成 DOCX |

**注意**: 不再需要 VL 模型，OCR 模型即可完成样式提取。

---

## 进度显示

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  基于模板生成文档
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ 📄 OCR提取模板样式
   └─ 样式提取完成

✓ ✨ LLM生成内容
   └─ 内容生成完成，约 5000 字符

✓ 🎨 文档合成
   └─ DOCX 生成完成: 2026-02-02_xxx_formatted.docx

✓ 💾 保存文件
   └─ 文件保存完成
```

---

## 已知限制（重要）

### docx.js 库的局限性

| 功能 | 状态 | 说明 |
|------|------|------|
| 行内格式混合 | ❌ 不支持 | 一个 TextRun 不能同时有粗体+斜体 |
| 嵌套列表 | ❌ 不支持 | 只能单层列表 |
| 复杂引用样式 | ⚠️ 部分支持 | 左边框+灰色背景可实现 |
| 页眉页脚动态内容 | ❌ 不支持 | 如总页数 "Page X of Y" |
| 复杂编号格式 | ❌ 不支持 | 如 "1.1.1.1" |
| 样式精确继承 | ❌ 不支持 | 需要手动设置每个元素 |

### 解决方案

1. **简单化 Markdown 生成**
   - 避免复杂的行内格式混用
   - 使用纯文本 + 标题层级

2. **手动后处理**
   - 生成的 DOCX 可在 Word 中微调
   - 复杂格式建议手动设置

3. **替代方案（待评估）**
   - 直接操作 XML（最灵活但复杂）
   - 使用 LibreOffice 命令行转换
   - 使用 python-docx（更强大）

---

## 难点实现状态评估（诚实记录）

### 难点列表与当前状态

| 难点 | 状态 | 说明 |
|------|------|------|
| 难点1: 样式提取不完整 | ❌ 未实现 | StyleExtractor 使用硬编码默认样式，未真正解析 DOCX |
| 难点2: Markdown到docx映射不准确 | ⚠️ 部分实现 | 基本映射可用，但 docx.js 限制导致不完整 |
| 难点3: docx.js不支持高级功能 | ✅ 已记录 | 无法突破库限制，需用户手动后处理 |
| 难点4: LLM生成内容不可控 | ⚠️ 部分实现 | 仅通过提示词约束，无格式校验反馈 |
| 难点5: 部署和性能问题 | ❌ 未实现 | 无性能优化、超时处理、错误恢复 |

### 难点1: 样式提取不完整（❌ 未实现）

**当前问题**：
```typescript
// StyleExtractor.extractFromDocx 返回的是硬编码默认值
static async extractFromDocx(docxPath: string): Promise<StyleRules> {
  // 直接返回默认样式，未解析实际 DOCX 文件
  return {
    title: { fontFamily: '黑体', fontSize: 22, ... },
    // ...
  };
}
```

**待实现方案**：
1. 解压 DOCX (zip) 解析 styles.xml
2. 使用 xml2js 读取 <w:style> 元素
3. 提取字体、字号、颜色、段落设置

### 难点2: Markdown到docx映射（⚠️ 部分实现）

**已实现**：
- ✅ 标题 (# ## ###) → HeadingLevel
- ✅ 列表 (- 1.) → Bullet/Numbering
- ✅ 引用 (>) → 左边框+斜体
- ✅ 代码块 (```) → Consolas 字体
- ✅ 表格 (|) → TableCell

**未实现（docx.js 限制）**：
- ❌ 行内格式混用 (粗体+斜体)
- ❌ 嵌套列表
- ❌ 复杂引用样式（多边框）
- ❌ 脚注尾注

### 难点3: docx.js 不支持高级功能（✅ 已记录）

| 功能 | 状态 | 说明 |
|------|------|------|
| 页眉页脚动态内容 | ❌ 不支持 | 如总页数 "Page X of Y" |
| 复杂编号格式 | ❌ 不支持 | 如 "1.1.1.1" |
| 样式精确继承 | ❌ 不支持 | 需要手动设置每个元素 |
| 条件格式 | ❌ 不支持 | docx.js 无此功能 |
| 内容控件 | ❌ 不支持 | docx.js 无此功能 |
| 域代码 | ❌ 不支持 | docx.js 无此功能 |

**当前解决方案**：
- 在 Word 中手动调整复杂格式
- 使用 LibreOffice 命令行转换（待评估）

### 难点4: LLM生成可控性（⚠️ 部分实现）

**当前方案**：
```typescript
private buildStylePrompt(styleRules: StyleRules): string {
  return `
## 文档格式规范
请严格按照以下格式生成文档：
- 一级标题：${s.heading1.fontFamily}，${s.heading1.fontSize}pt
- 正文：${s.body.fontFamily} ${s.body.fontSize}pt
  `;
}
```

**待增强**：
- 格式校验：解析生成内容，检查格式规范
- 反馈循环：格式不符时让 LLM 重试
- Few-shot 示例：提供格式示例

### 难点5: 部署和性能（❌ 未实现）

**待实现**：
- [ ] 大文件分块处理
- [ ] LLM API 超时重试（当前无超时处理）
- [ ] 内存监控和清理
- [ ] 错误恢复机制
- [ ] 缓存已提取的样式
- [ ] DOCX 打包优化

### 进度显示改进（2026-02-02 新增）

**修复的问题**：
- ✅ 移除重复的 reportProgress 调用
- ✅ 添加进度条动画（███░░░░░░░░░░░░░░░ 65%）
- ✅ 修复颜色格式错误（hexToRgb → fixColor）
- ✅ 修复进度显示重叠 bug

**当前进度显示**：
```
⠙ 📄 OCR提取模板样式
   └─ ✓ 样式提取完成 - 标题黑体16pt, 正文宋体12pt
⠋ ✨ LLM生成内容
   └─ 正在生成文档...
████████████████████░░░░ 65%
```

---

## TUI 交互设计

### 键盘快捷键

| 按键 | 功能 |
|------|------|
| `/` | 打开命令菜单 |
| `Enter` | 提交输入 |
| `Backspace` | 删除字符 |
| `Esc` | 取消/返回 |
| `Ctrl+C` | 强制退出 |

### 命令菜单结构

```
╔══════════════════════════════╗
║     DocForge v0.1            ║
╠══════════════════════════════╣
║  从零开始撰写                 ║
║  基于模板生成                 ║
╠──────────────────────────────╣
║  工具                        ║
║  ├─ MCP 工具                 ║
║  └─ Skills 管理              ║
╠──────────────────────────────╣
║  设置                        ║
║  ├─ 模型配置                 ║
║  └─ 项目设置                 ║
╠──────────────────────────────╣
║  系统                        ║
║  ├─ 帮助                     ║
║  └─ 退出                     ║
╚══════════════════════════════╝
```

---

## 格式规范（专业文档标准）

### 中文正式文档格式（默认值）

```json
{
  "title": {
    "fontFamily": "黑体",
    "fontSize": 22,
    "fontBold": true,
    "alignment": "center"
  },
  "heading1": {
    "fontFamily": "黑体",
    "fontSize": 16,
    "fontBold": true
  },
  "heading2": {
    "fontFamily": "楷体",
    "fontSize": 14,
    "fontBold": true
  },
  "body": {
    "fontFamily": "宋体",
    "fontSize": 12,
    "alignment": "justify",
    "lineSpacing": 1.5,
    "indent": 240
  },
  "pageMargin": {
    "top": 1440,
    "bottom": 1440,
    "left": 1440,
    "right": 1440
  }
}
```

---

## Python 解决方案（python-docx）

由于 docx.js 库的限制，我们使用 Python 的 `python-docx` 库来生成 DOCX。

### 依赖

```txt
# requirements.txt
python-docx>=1.1.0
lxml>=4.9.0
```

### 创建虚拟环境

```bash
# 使用 Python 3.13
py -3.13 -m venv .venv
.venv\Scripts\pip install python-docx lxml
```

### Python 脚本功能

```python
# scripts/docforge_py.py

# 1. 提取 DOCX 模板样式
python docforge_py.py extract template.docx styles.json

# 2. 生成带样式的 DOCX
python docforge_py.py generate content.md output.docx --style styles.json
```

### Python 相比 docx.js 的优势

| 功能 | docx.js | python-docx |
|------|---------|-------------|
| 行内格式混用 | ❌ 不支持 | ✅ 支持 |
| 嵌套列表 | ❌ 不支持 | ✅ 支持 |
| 引用样式 | ⚠️ 部分 | ✅ 完整支持 |
| 页眉页脚 | ❌ 不支持 | ✅ 支持 |
| 复杂编号 | ❌ 不支持 | ✅ 支持 |
| 表格样式 | ⚠️ 有限 | ✅ 完整支持 |

### TypeScript Wrapper

```typescript
// services/python-docx.ts
import { extractStylesFromDocx, generateDocxWithPython } from './python-docx';

// 提取样式
const styles = await extractStylesFromDocx('template.docx');

// 生成 DOCX
const docxPath = await generateDocxWithPython({
  markdown: content,
  outputPath: 'output.docx',
  styleRules: styles
});
```

---

## 常见问题与解决方案

### Q1: 生成的 DOCX 格式不完美

**原因**: docx.js 库的功能限制

**解决方案**:
1. 接受当前限制，使用生成的 DOCX 作为基础
2. 在 Word 中手动微调格式
3. 考虑使用 LibreOffice 进行转换

### Q2: 行内格式丢失

**原因**: docx.js 不支持一个 TextRun 中混合粗体+斜体

**解决方案**:
1. 简化 Markdown 格式，避免混用
2. 或使用多个 TextRun（会增加复杂度）

### Q3: ESC 键导致输入失效

**症状**: 按 ESC 后 `/` 键无法触发命令菜单

**解决方案**:
```typescript
function resetStdin() {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.pause();
}
```

### Q4: DOCX 生成错误 "value '0,0,0'. Expected 6 digit hex value"

**症状**: 生成 DOCX 时报错颜色格式错误

**原因**: docx.js 需要 `#RRGGBB` 格式的颜色值，但代码传递了 `R,G,B` 格式

**解决方案**:
```typescript
// 修复前
private hexToRgb(hex?: string): string | undefined {
  return result
    ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
    : undefined;  // 返回 "255,0,0" 格式，错误！
}

// 修复后
private fixColor(color?: string): string | undefined {
  if (!color) return undefined;
  if (!color.startsWith('#')) {
    return '#' + color;  // 确保有 # 前缀
  }
  return color;  // 返回 "#RRGGBB" 格式
}
```

---

## 代码模式库

### 模式1: stdin 状态管理

```typescript
import readline from 'readline';

function resetStdin() {
  if (process.stdin.isTTY && process.stdin.isRaw) {
    process.stdin.setRawMode(false);
  }
  process.stdin.removeAllListeners('keypress');
  readline.emitKeypressEvents(process.stdin);
  if (!process.stdin.isPaused()) {
    process.stdin.pause();
  }
}
```

### 模式2: 文档合成

```typescript
const synthesizer = new DocumentSynthesizer(styleRules);
const docxPath = await synthesizer.synthesize(content, outputPath, {
  addTimestamp: true
});
```

### 模式3: 进度回调

```typescript
await controller.generateDocumentFromTemplate(template, topic, desc, {
  onProgress: (progress) => {
    console.log(`${progress.icon} ${progress.step}: ${progress.message}`);
  }
});
```

---

## 迭代日志

### 2026-02-02

- [x] 简化流程：移除 VL 模型，只需 OCR + LLM
- [x] 新增 DocumentSynthesizer 服务
- [x] 添加 StyleExtractor 样式提取
- [x] 更新进度显示
- [x] 记录 docx.js 库的限制
- [x] 从 TUI 配置菜单完全移除 VL 选项
- [x] 更新模型调用链路显示（只显示 OCR + LLM）
- [x] 诚实评估难点实现状态并记录
- [x] 修复 DOCX 生成颜色格式错误（hexToRgb → fixColor）
- [x] 修复进度显示混乱的 bug
- [x] 修复进度回调重复调用问题（移除重复的 reportProgress）
- [x] 添加进度条显示
- [x] 使用 Python python-docx 替代 docx.js（解决库限制）
- [x] 创建 Python 样式提取脚本
- [x] 创建 TypeScript Python wrapper

### 待办

- [x] 实现真正的 DOCX 样式解析（使用 Python python-docx）
- [x] 添加 Python 依赖（python-docx, lxml）
- [x] 创建 Python 脚本 (scripts/docforge_py.py)
- [x] 创建 TypeScript wrapper (services/python-docx.ts)
- [x] 更新 controller.ts 使用 Python 生成 DOCX
- [ ] 评估 LibreOffice 转换方案
- [ ] 添加格式校验反馈机制
- [ ] 添加手动后处理建议
- [ ] 添加性能优化（分块处理、超时重试）

---

## 学习要点

1. **简化设计**: 移除不必要的组件（VL 模型）
2. **明确限制**: 文档库的限制需要在设计阶段就考虑
3. **渐进增强**: 先实现基本功能，再优化细节
4. **用户预期管理**: 明确告知生成文档的格式限制
5. **技术选型**: 当 JS 库有限制时，Python 是更好的选择
6. **混合架构**: TypeScript 调用 Python 脚本，发挥各自优势

---

*本文档会随着项目演进持续更新*
*最后更新: 2026-02-02 同步到 GitHub，使用 Python python-docx 替代 docx.js*
