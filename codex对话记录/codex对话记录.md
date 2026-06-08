# 继续完善该项目，先做代码审查，再将最新的技术等等，将此维护到极致，并且我本地常用obsidian，很大的一个痛点就是，生产的文档无法直接用，一定要将此项目做到极致，减轻文档开发的工作量，可以借助网络各种强大的技术

### User
_2026-05-12 20:09:32_

# AGENTS.md instructions for F:\1work\xyjk_Proposal

<INSTRUCTIONS>
Always respond in Chinese-simplified

--- project-doc ---

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

</INSTRUCTIONS>

<environment_context>
  <cwd>F:\1work\xyjk_Proposal</cwd>
  <shell>powershell</shell>
  <current_date>2026-05-12</current_date>
  <timezone>Asia/Shanghai</timezone>
</environment_context>

### User
_2026-05-12 20:09:32_

继续完善该项目，先做代码审查，再将最新的技术等等，将此维护到极致，并且我本地常用obsidian，很大的一个痛点就是，生产的文档无法直接用，一定要将此项目做到极致，减轻文档开发的工作量，可以借助网络各种强大的技术

### Assistant
_2026-05-12 20:09:51_

我先按“代码审查优先”的路线走，先把项目现状摸清，再决定哪些地方值得重构、哪些地方需要直接补强，尤其会盯住 Obsidian 直接可用这件事。

### Assistant
_2026-05-12 20:10:30_

我先把两件事并起来做：`review` 看现状和风险，`brainstorming` 定方向和方案。这样不会一上来就乱改，先把该补的技术债和 Obsidian 这个核心痛点钉死。

### Assistant
_2026-05-12 20:11:08_

我先抓项目骨架和最近改动，确认它现在是个什么状态，再往里看实现细节。这样后面的审查不会漂在空中。

### Assistant
_2026-05-12 20:11:57_

`rg` 这边在这个环境里起不来，我换成 PowerShell 原生方式继续摸文件。先把关键入口和服务层读出来，看看哪里真的在拖文档质量。

### Assistant
_2026-05-12 20:12:27_

我现在在读核心实现，不是看表面 README。重点是找那种会让文档“生成出来但不能直接用”的硬伤，这类问题最伤实际工作流。

### Assistant
_2026-05-12 20:13:21_

现在已经能看到一些味道了，尤其是 `docx` / Python 这条链路和 Web API 的边界。接下来我补 workflow 和 LLM 层，这样才能判断问题是“实现脆”还是“架构本身就偏”。

### Assistant
_2026-05-12 20:13:54_

我已经读到一层能下判断的代码了，下一步我让编译器替我再狠狠干一遍。很多“看起来能跑”的问题，其实会先在这一步露馅。

### Assistant
_2026-05-12 20:15:35_

我已经确认了一个事实：代码能编过，不代表文档链路是顺的。现在我去看那些“真的会把用户卡住”的地方，尤其是输出格式、路径、预览和 Web 交互。

### Assistant
_2026-05-12 20:17:13_

我这边已经看到几条足够硬的缺陷了，先别急着修，我想确认项目里有没有已经埋好的 Obsidian 入口或 Markdown 导出链路，免得重复造轮子。

### Assistant
_2026-05-12 20:18:32_

我已经够材料去下第一轮判断了，不过我想再看一眼 `agent` 和 MCP 那条导出链路，看看它们有没有重复踩同一个坑。重复踩坑，通常就不是偶然。

### Assistant
_2026-05-12 20:18:59_

我已经确认项目里没有现成的 Obsidian 专项支持。最后补一下前端主面板，看看现在的输出动作到底有多“能用”，还是只是把文本吐出来。

### Assistant
_2026-05-12 20:20:16_

我再核一下取消逻辑。这个项目有“中止生成”按钮，但按钮能不能真的省钱，完全是另一回事。

### Assistant
_2026-05-12 20:24:15_

我顺手看一下测试层，避免我们修完一轮，结果只是把没覆盖的坏路径继续留着。这个项目要真做重，测试不能是摆设。

### Assistant
_2026-05-12 20:31:09_

我先做了审查，先拎 5 个会直接影响交付的硬问题：

1. [严重] [src/api/server.ts:154](F:/1work/xyjk_Proposal/src/api/server.ts:154) 开始的模板上传，和后面的预览、重命名、删除、下载路径，都没有做规范化校验，`..` 可以逃出 `templates` / `output`，`startsWith` 那个下载保护也能被前缀绕过。
2. [严重] [src/tui/controller.ts:535](F:/1work/xyjk_Proposal/src/tui/controller.ts:535) 调的是 [src/services/document-synthesizer.ts:566](F:/1work/xyjk_Proposal/src/services/document-synthesizer.ts:566) 里的 `StyleExtractor.extractFromDocx`，但那个 extractor 只是固定默认样式，模板风格实际上没被提取，风格迁移名义上有，实际上没有。
3. [中] [src/api/server.ts:191](F:/1work/xyjk_Proposal/src/api/server.ts:191) 的取消只停了 SSE，`LLMClient` 没有把 AbortSignal 传下去，用户点停止后，上游模型还在继续跑，钱照烧。
4. [中] [src/workflow/document.ts:117](F:/1work/xyjk_Proposal/src/workflow/document.ts:117) 用 `topic.replace(/\s+/g, '_')` 直接拼文件名，常见标题里的 `/ : ?` 会让输出失败，还可能写出 `output` 目录。
5. [中] [web/src/components/ConfigPanel.tsx:122](F:/1work/xyjk_Proposal/web/src/components/ConfigPanel.tsx:122) 把空 API Key 直接判死刑，和后端的部分更新接口冲突，用户不能只改 `baseUrl` / `model` 而保留已有 key。

我跑了 `npm run build` 和 `npm run web:build`，都过了，但仓库里没看到项目级测试，所以这些坏路径目前基本没人兜底。

我也查了 Obsidian 官方文档，确认它最适合的主输出其实是本地 Markdown vault，配合 [Properties](https://help.obsidian.md/properties)、[Internal links](https://help.obsidian.md/Linking%20notes%20and%20files/Internal%20links)、[Attachments](https://help.obsidian.md/attachments)、[Callouts](https://help.obsidian.md/callouts) 就能直接进工作流；Pandoc 这边则可以用 [--reference-doc / custom styles](https://pandoc.org/MANUAL.html?source=post_page---------------------------) 和 [模板](https://pandoc.org/demo/example33/6-templates.html) 控制 DOCX 样式。

我建议下一步先把 Obsidian 作为主输出。你要我先做“直接可放进 Vault 的 Markdown 包”，还是先把现有 DOCX/Web 生成链路修到更稳？

### User
_2026-05-12 20:32:08_

把我该项目做到极致吧，开始试试

### Assistant
_2026-05-12 20:32:55_

我开始动手了，先把会真正提升“可直接拿去用”的部分打掉。优先级是：能进 Obsidian、能安全落盘、能真取消生成。

### Assistant
_2026-05-12 20:34:36_

我决定先做一组能立刻让用户感知的改动，而不是堆概念：输出改成 Obsidian 可直接吃的 Markdown，模板风格真的解析，取消真的能停，路径真的安全。

### Assistant
_2026-05-12 20:37:50_

我先把两件事并行起来：一边做代码审查找出最值得先动的点，一边把项目往“Obsidian 直接可用”的方向收紧。先看仓库现状和关键链路，再决定第一刀落在哪。

### User
_2026-05-12 20:37:54_

可是我obsidian的文档最终还是要搞成docx格式啊，md格式的文档只能是开发看看

### Assistant
_2026-05-12 20:38:29_

我把方向修正一下：最终成品还是 `DOCX`，`Markdown` 只负责开发预览和中间态。现在先做审查，重点看生成链路、样式提取、取消控制和路径安全，看看哪些地方最该先补。

### Assistant
_2026-05-12 20:39:24_

我已经把主链路摸清了，接下来补两块：一块看前端/配置这边有没有把后端能力卡死，另一块看 DOCX 生成链路有没有“看起来能用、其实很脆”的地方。读完我就能给你一个更硬的审查结论。

### Assistant
_2026-05-12 20:40:00_

我已经看见几处“能跑但不够硬”的问题了。现在补一下行号，等会儿我会把审查意见按严重度排出来，再挑最值得立刻修的地方下手。

### Assistant
_2026-05-12 20:40:41_

我先把审查方法对齐一下，避免我只盯着实现、漏掉真正会影响落地的风险。读完这份 review 规则，我就按它的优先级给你结论。

### Assistant
_2026-05-12 20:43:26_

我已经看到一个关键事实了，项目现在不是一个统一的生成链路，而是 CLI 和 TUI 各走各的。这个要先摁住，不然你后面改再多，用户还是会踩到旧路子。

### Assistant
_2026-05-12 20:47:58_

我现在不改文件，先把审查落地成可执行的第一轮方案。为了不靠记忆说话，我再跑一次构建确认当前基线能不能过。

### Assistant
_2026-05-12 20:49:41_

明白，最终目标改成更准确的一句话：

**DocForge 的主产物是可直接交付的 DOCX，Markdown 只是开发预览和中间稿。**

我先做了代码审查，当前基线 `npm run build`、`npm run web:build` 都通过。主要问题按优先级如下：

**审查发现**

1. **路径安全风险，高优先级**  
[server.ts](F:/1work/xyjk_Proposal/src/api/server.ts:160)、[server.ts](F:/1work/xyjk_Proposal/src/api/server.ts:389)、[server.ts](F:/1work/xyjk_Proposal/src/api/server.ts:527) 直接拼接用户传入文件名或用 `startsWith` 判断目录，上传、预览、删除、下载都有路径穿越风险。这个要先修。

2. **取消生成没有真正取消模型请求**  
[server.ts](F:/1work/xyjk_Proposal/src/api/server.ts:188) 只维护 `{ aborted }`，前端断开后只是停止 SSE 输出；[adapters.ts](F:/1work/xyjk_Proposal/src/llm/adapters.ts:137) 和 [adapters.ts](F:/1work/xyjk_Proposal/src/llm/adapters.ts:324) 的流式 `fetch` 没有接 `AbortSignal`。用户点取消后，LLM 仍可能继续跑到超时。

3. **模板样式提取仍是假的**  
[tui/controller.ts](F:/1work/xyjk_Proposal/src/tui/controller.ts:535) 调用的是 [document-synthesizer.ts](F:/1work/xyjk_Proposal/src/services/document-synthesizer.ts:566)，而这里直接返回硬编码默认样式。也就是说“按模板还原样式”现在没有真正发生。

4. **CLI 和 Web/TUI 生成链路不一致**  
[workflow/document.ts](F:/1work/xyjk_Proposal/src/workflow/document.ts:57) 仍使用旧的 `DocxGenerator/docx.js`，但模板生成路径已经接了 Python。结果是同一个项目里有两套 DOCX 引擎，CLI 用户仍会踩到旧限制。

5. **配置面板阻断正常更新**  
[ConfigPanel.tsx](F:/1work/xyjk_Proposal/web/src/components/ConfigPanel.tsx:123) 要求每次保存都重新输入 API Key，但后端已经支持部分更新。这会让用户只想改模型名/Base URL 时被卡住。

**我建议的第一轮改法**

先不碰花哨功能，先把底座打硬：

1. 统一安全路径 helper，修模板、历史、下载、上传、重命名。
2. 把 `AbortSignal` 从前端、API、Controller、LLMClient 一直传到 adapter 的 `fetch`。
3. 把模板样式提取切到已有的 Python `extractStylesFromDocx`，让 DOCX 风格迁移变成真的。
4. 统一 DOCX-first 生成链路，CLI 也走 Python DOCX，Markdown 只作为旁路调试稿。
5. 修配置面板，允许保留现有 API Key 只更新模型配置。

我下一步就按这个顺序开改。当前我会避开已有用户改动：`.claude/settings.local.json` 和未跟踪的 `AGENTS.md`。

### User
_2026-05-12 20:51:43_

开始改！

### Assistant
_2026-05-12 20:52:36_

收到，我开始动代码。第一轮先修“底座”：路径安全、真取消、真实样式提取、DOCX-first 链路和配置面板保存逻辑，这些会直接决定项目能不能放心长期用。

### Assistant
_2026-05-12 20:54:48_

准备开始第一组编辑：新增一个 `path-safety` 工具，把“文件名清洗”和“必须落在指定目录内”做成可复用能力。这样后端所有文件操作会走同一套门禁，后面测试也能直接压住。

### Assistant
_2026-05-12 20:56:43_

我在后端入口接入这个工具：上传时清洗原始文件名，预览/删除/重命名只允许访问模板目录，历史只允许访问输出目录，下载只允许模板或输出目录内的受支持文档。

### Assistant
_2026-05-12 20:58:44_

我发现一个细节：安全工具不能把 `../foo.docx` 悄悄变成 `foo.docx`，那样虽然不会越界，但会把恶意输入映射到另一个合法文件。现在把它改成遇到路径分隔符直接拒绝，主题生成文件名则走独立清洗。

### Assistant
_2026-05-12 21:01:37_

现在接取消控制：把 `AbortSignal` 放进 LLM 客户端和两个 adapter。这样用户点取消时，不只是前端安静下来，而是上游 HTTP 请求也会被中断。

### Assistant
_2026-05-12 21:05:30_

接下来把“模板风格迁移”从假数据切到真实解析。这里直接复用已有 Python `python-docx` 提取结果，再转换回 TypeScript 的 `StyleRules`，这样旧调用点不用大面积重写。

### Assistant
_2026-05-12 21:07:11_

现在统一 CLI 的 DOCX 路线。旧 CLI 还在走 `docx.js`，这和你“最终必须是 DOCX”的目标冲突，所以我把它切到 Python DOCX 生成器，Markdown 只作为内存里的结构化中间稿。

### Assistant
_2026-05-12 21:08:09_

再修前端配置面板：现在只改模型名或 Base URL 也被迫重新输入 API Key，这很伤使用体验。我会让“留空保持原 Key”真正生效，同时仍然阻止第一次配置时空 Key 保存。

### Assistant
_2026-05-12 21:08:55_

我顺手把 Python 样式提取也往真实文档靠一层：很多中文正式文档并不会用 Word 的 Heading 样式，而是直接给段落套字体字号。所以除了读取内置样式，还会从实际段落里推断标题、一级/二级标题和正文。

### Assistant
_2026-05-12 21:09:58_

第一轮核心改动已经落下了，我现在跑一次 TypeScript 构建，先把类型错误暴露出来再补测试。

### Assistant
_2026-05-12 21:10:25_

类型构建已经过了。现在补最小测试，先锁住路径穿越、扩展名限制和主题文件名清洗，防止后面继续迭代时把安全门又拆掉。

### Assistant
_2026-05-12 21:13:11_

测试本身 6 个都过了，但第一次命令进了 Vitest watch 模式，命令因此等到超时才返回。这个是命令姿势问题，不是测试失败；我用 `vitest run` 再跑一次拿干净结果。

### Assistant
_2026-05-12 21:13:49_

我顺便修一个更隐蔽的 SSE 细节：取消/断开应该监听响应连接关闭，而不是请求体关闭。POST 请求体很快读完，拿它判断长连接状态不够稳。

### Assistant
_2026-05-12 21:15:03_

第一轮已经能构建、测试通过。我现在做一遍自查 diff，专门找类型外的逻辑问题，比如错误码、清理临时文件、取消时是否会误报。

### Assistant
_2026-05-12 21:15:36_

自查里看到两个小的可读性/行为点：CLI 的类型导入可以彻底变成 type-only，另外模板生成在没传模板时应该给明确错误，而不是落到“无扩展名”。我把这两个补掉。

### Assistant
_2026-05-12 21:16:15_

我再跑一遍构建和测试，确认刚才那两个收尾修补没有把东西打歪。之后我就把结果整理给你。

### Assistant
_2026-05-12 21:16:28_

最后看一眼工作区，确保没有把别的用户改动误碰进去，也确认这轮真正改到的文件集合。

### Assistant
_2026-05-12 21:17:28_

我把 CLI 的 DOCX 生成再补一层：不只是“改成 Python 生成”，还把现有的字体、页边距、段落间距传过去，避免回到默认模板。

### Assistant
_2026-05-12 21:17:59_

我刚把 CLI 的样式传参补回去了。再跑一遍构建，确认这次不是只“能生成”，而是“按现有样式生成”。

### Assistant
_2026-05-12 21:18:34_

我把接口错误码也顺手理一下。像“非法文件名”“不支持的文件类型”这类用户输入问题，应该回 400，不该装作服务器坏了。这样前端提示会更准。

### Assistant
_2026-05-12 21:19:24_

我发现一个真 bug，不是风格问题。`addTimestamp` 现在其实只会动到不存在的侧车 Markdown，DOCX 本体不会变。我把它改成在生成前写进 Markdown，这样时间戳会真的出现在最终 DOCX 里。

### Assistant
_2026-05-12 21:20:05_

我再把一层更硬的门补上，防 symlink 绕过。单纯 `path.resolve` 只能挡路径穿越，挡不住目录里挂个链接把文件引到目录外。这个项目做文档生成，这种绕法没必要留。

### Assistant
_2026-05-12 21:20:44_

这个测试把我提醒得很及时。现在 `resolveExistingFileInRoots` 遇到不存在的路径会直接冒 `ENOENT`，这对 API 不友好。我把它收敛成统一的“非法文件路径”。

### Assistant
_2026-05-12 21:21:16_

我最后把 Python 脚本做一次语法检查。TypeScript 过了不代表 Python 那边也没手滑。

### Assistant
_2026-05-12 21:22:03_

Python 语法检查落了一个 `__pycache__`，我清掉它，不让工作区多出噪音文件。

### Assistant
_2026-05-12 21:23:11_

我换个更稳的方式清理这个临时产物，不走删除命令了，直接把那一个 `.pyc` 文件从补丁里移除。

### Assistant
_2026-05-12 21:23:47_

我换成更长期的办法处理这个缓存文件问题，不删现存产物，直接把 Python 缓存目录加进忽略规则。这样以后不会再冒出来。

### Assistant
_2026-05-12 21:23:59_

我把 Python 缓存目录一起忽略掉，省得每次跑语法检查都给工作区添噪音。这个比硬删更稳。

### Assistant
_2026-05-12 21:24:27_

我注意到我刚才把几个预览接口的错误返回形状统一过头了。对前端来说，`preview` 更适合继续回 `{ error: ... }`，不然它的错误分支会读不到原字段。这个我改回去。

### Assistant
_2026-05-12 21:24:49_

我顺手把前端预览兜底补上。后端现在会更严格地报错，前端也得认得 `error/message` 字段，不然用户看到的是空白。那就太亏了。

### Assistant
_2026-05-12 21:25:10_

前端兜底改完，我再跑一次 Web 构建，确认这条预览错误链没把 UI 类型打坏。

### Assistant
_2026-05-12 21:25:59_

已经开改了，这轮先把底座打硬了。

- 新增了 `src/utils/path-safety.ts`，模板、历史、下载、上传、重命名都走统一安全门，修了路径穿越和 `startsWith` 误判，也顺手防了 symlink 绕过。
- LLM 请求层已经贯穿 `AbortSignal`，取消现在会真的打断上游请求，不只是停 SSE。
- `StyleExtractor` 不再是假数据，`DOCX` 模板会走 Python `python-docx` 真实解析；CLI 也切到了 Python DOCX 生成链路，不再依赖旧的 `docx.js` 主路。
- DOCX 生成保留了现有样式配置，时间戳也真正写进最终 DOCX 了。
- 配置面板现在支持“留空保留已保存 API Key”，不再强迫每次重填。
- 预览接口的错误兜底也补了，前端不会再拿到空白预览。

我还补了最小测试 `tests/path-safety.test.ts`，并把 Python 缓存目录加进 `.gitignore`。  
验证通过：`npm run build`、`npm run web:build`、`npx vitest run tests/path-safety.test.ts`、`py -3.13 -m py_compile scripts/docforge_py.py`。

我没动你现有的 `.claude/settings.local.json` 和那份 `AGENTS.md`。

### User
_2026-05-12 21:30:13_

继续！把项目推到极致！

### Assistant
_2026-05-12 21:30:44_

我继续往前推，但这次不是瞎加功能。我先扫一遍项目里还挂着的 TODO 和真正值钱的薄弱点，再挑最能提升交付质量的那一块下手。

### Assistant
_2026-05-12 21:33:16_

我接下来补一个很关键的行为一致性问题。取消不该在某些网络分支被吞掉，也不该让搜索超时误伤整条生成链。这个修完，取消按钮才算真的“像样”。

### Assistant
_2026-05-12 21:33:44_

我刚才的第一版拦截写得太狠了，会把超时也当成不可重试的取消。这个得收一下，只把真正的外部取消视为终止，超时还是走重试。

### Assistant
_2026-05-12 21:34:17_

我把那个超时标记去掉，保持实现干净。这里只要能区分“外部取消”和“普通超时”就够了，别给自己再埋一层状态。

### Assistant
_2026-05-12 21:34:35_

我发现刚才一个判断条件会把超时也算成外部取消，这会把搜索的“降级返回空”又搞坏。这个我立刻收紧，只认外部信号。

### Assistant
_2026-05-12 21:34:48_

我再补一个直接能让成品更像正式文档的东西，页脚页码。这个用 Word 打开时会自动生效，领导那边看起来就不是一坨裸文本了。

### Assistant
_2026-05-12 21:35:21_

我刚插进去一个 Python 小函数，顺手检查一下缩进，Python 对这个很小气，错一个空格就会翻脸。

### Assistant
_2026-05-12 21:38:10_

我先把现有改动和项目约束摸清，再补关键能力和验证；这次会同时做一轮审查和加固，把 DOCX 输出链路往“可直接交付”的方向推。

### Assistant
_2026-05-12 21:38:28_

我先把当前分支状态和关键入口文件对齐，顺手确认一下技能要求的工作流，这样后面改动不会偏航。

### Assistant
_2026-05-12 21:38:56_

我在看这轮改动里最关键的几条链路：Python 生成器、服务层、Web API、安全边界和测试。先找出真正还能再抬一截的地方，再动手。

### Assistant
_2026-05-12 21:39:31_

我已经看到一个很像“漏接”的点：页脚页码函数写出来了，但还没真正接到输出链路里。先把相关调用和取消/配置链路一起扫一遍，避免边改边漏。

### Assistant
_2026-05-12 21:39:47_

项目主线已经清楚了，接下来我把“会直接影响交付质量”的点先修掉：页脚页码接上、生成链路更稳、再把文档和测试补齐。先看现有测试覆盖到哪。

### Assistant
_2026-05-12 21:40:00_

我已经看到当前测试只覆盖路径安全，跟 DOCX 主链还差一截。接下来会补一个更能兜住交付质量的测试面，然后把生成器里明显还没接上的功能补上。

### Assistant
_2026-05-12 21:40:52_

我在核对“留空保留 API Key”这条链路，确认前端没发空值以后，后端有没有误覆盖。这个地方一旦有空值写回去，体验会很烦。

### Assistant
_2026-05-12 21:42:41_

我抓到一个更关键的偏差了：从零开始生成这条主线，现在还是只落成了 `.md`，和“DOCX-first”并不完全一致。这个我会一起补上，让两条主流程的交付物统一。

### Assistant
_2026-05-12 21:43:07_

我确认到前端已经把“有无 `docxPath`”当成交付质量信号了，所以从零开始这条线如果只给 `MD`，体验确实会掉一个档。这个我会一并补成双产物。

### Assistant
_2026-05-12 21:45:31_

我再确认一下工作流返回值有没有被别处强依赖，避免加了 `docxPath` 把旧调用弄断。确认完就动手改输出链路。

### Assistant
_2026-05-12 21:46:48_

我要先把文件名生成这块收紧：现在很多输出路径都按“当天日期”命名，重复生成时会互相覆盖。顺手把它改成带时间戳和短唯一尾巴的命名。

### Assistant
_2026-05-12 21:47:19_

Python 这边我准备补两件最值钱的：页脚页码和更稳的文件元信息，同时顺手把有序列表的显示补正常。这样导出的 DOCX 更像正式成品。

### Assistant
_2026-05-12 21:48:59_

接下来把 Python 调用也加固一下：临时文件要唯一、失败后要清干净，DOCX 最终文件也要原子落盘，别让半成品混进输出目录。

### Assistant
_2026-05-12 21:52:07_

前端和 TUI 也要跟上，不然后端已经产出 DOCX 了，界面还在只报 Markdown，信息就断层了。这个我顺手补掉。

### Assistant
_2026-05-12 21:52:15_

我也把工作流那条默认输出名修一下，避免同一个题目多次生成时互相覆盖。这个是很容易踩、但很值得修的坑。

### Assistant
_2026-05-12 21:53:20_

我把命名和成品链路补完后，再扫一遍还有没有别的地方在偷偷用“旧的日期命名”或只产 MD。这样能一次性收干净。

### Assistant
_2026-05-12 21:54:35_

我先做一轮硬验证，看看这波改动有没有把类型、前端构建和 Python 生成脚本一起跑通。这样后面补文档会更踏实。

### Assistant
_2026-05-12 21:55:14_

我再做一个真机式小样本，直接跑一遍 Python 生成，看页脚和有序列表是否真的进到 DOCX 里，而不是只在代码里“看起来应该会”。

### Assistant
_2026-05-12 21:55:37_

刚才那次直接调系统 Python，缺了 `python-docx`，这也说明我们的回退逻辑是对的：实际应该走项目自带的 `.venv`。我换成 venv 再跑一遍。

### Assistant
_2026-05-12 21:55:54_

生成已经跑通了，我现在看一下成品里有没有页脚和页码字段，顺便确认有序列表没有再被吃掉。

### Assistant
_2026-05-12 21:56:10_

页脚确认到了，接着再确认一下有序列表在 XML 里确实被写成了带编号的文本，避免只是“看起来像”。

### Assistant
_2026-05-12 21:56:47_

我再把 TS 包装层也跑一遍，这样就能确认不是“Python 脚本单独能跑”，而是项目真正的调用入口也能落出 DOCX。

### Assistant
_2026-05-12 21:57:01_

包装层也过了。最后再确认一下生成文件和内容，收尾前把现状看完整。

### Assistant
_2026-05-12 21:57:14_

样本已经验证完了，我把这次临时产物清掉，避免输出目录里混进没必要的测试文件。

### Assistant
_2026-05-12 21:57:28_

我把功能和验证都压了一轮，接下来只差把 README / 项目文档跟上新架构，再收一次 diff，确认没有语义打架的地方。

### Assistant
_2026-05-12 21:58:01_

最后把用户能直接看到的说明文档同步到新现实：现在项目的交付物是 DOCX，Markdown 只是中间预览，避免 README 还在讲旧故事。

### Assistant
_2026-05-12 21:58:40_

我把文档再抠细一点，那个架构图里被我拆开的 `python-docx` 看着有点别扭，我顺手修正一下。

### Assistant
_2026-05-12 21:58:54_

我还注意到一处老图示仍然把样式提取写成 Mammoth 了，这会误导后续维护。我把它改成更贴近当前实现的版本。

### Assistant
_2026-05-12 21:59:45_

我顺手看一下有没有残留的临时输出文件，确认我们那套“先写临时件、成功后再落盘”的处理是真的干净的。

### Assistant
_2026-05-12 22:00:23_

我看一眼 README 和项目文档的开头版式，确认这次同步没有把说明写歪。

### Assistant
_2026-05-12 22:02:09_

我再把文档里那个“OCR 提取样式”的旧提法往回收一收，避免读文档的人以为现在的主路还是 OCR 识别。

### Assistant
_2026-05-12 22:03:28_

这份持续学习文档里还有几处“已修的问题仍写成未实现”，这会误导下一轮维护。我把难点状态同步到现在的真实状态。

### Assistant
_2026-05-12 22:04:39_

既然这是“持续学习版”项目文档，我把这次 2026-05-12 的迭代也记进去，后面接手的人不用从 diff 里猜发生了什么。

### Assistant
_2026-05-12 22:05:14_

我最后跑一下 diff 检查，看看有没有尾随空格、冲突标记这类低级噪点。然后再收最终状态。

### Assistant
_2026-05-12 22:05:55_

继续推进了一轮，核心方向已经更贴近你说的“Obsidian 只是开发看，最终必须 DOCX”。

这次主要改了这些：

- 从零生成也改成 `DOCX-first`：现在会产出最终 `.docx`，`.md` 只作为预览/中间态。
- Python DOCX 生成增强：补了文档元信息、页脚页码、有序列表编号。
- 输出文件防覆盖：默认文件名改成毫秒时间戳 + 短唯一后缀，同一天同主题多次生成不会互相覆盖。
- Python 包装层加固：临时文件唯一化、失败后清理、DOCX 先写临时文件再落成品。
- README 和持续学习文档已同步，避免继续被旧的 docx.js/OCR 描述误导。
- 新增了时间戳输出名测试。

已验证通过：

- `npm run build`
- `npm run web:build`
- `npx vitest run tests/path-safety.test.ts`
- `py -3.13 -m py_compile scripts/docforge_py.py`
- 手动跑了一次 DOCX 生成，确认 `footer1.xml` 里有 `PAGE / NUMPAGES` 页码字段，有序列表也写进了文档 XML。

### User
_2026-05-12 22:06:38_

继续把项目推进到极致

### Assistant
_2026-05-12 22:07:12_

我继续往下推。先用一次“审查眼”找下一批高价值问题，不急着堆功能；现在最容易把项目抬高的，是把配置、导出和验证链路变得真正可靠。

### Assistant
_2026-05-12 22:07:44_

我用了 `brainstorming` 和 `docx` 两个技能来约束这轮推进：一个负责别盲目加功能，一个负责把 Word/DOCX 交付质量放在中心。下一刀我会优先修“配置保存后测试仍可能用旧配置”这类体验硬伤。

### Assistant
_2026-05-12 22:08:16_

我发现一个很实在的问题：模型配置保存后，测试连接可能还在用旧的 `ModelScopeService` 缓存；更糟的是后端部分更新时可能把未传字段写成 `undefined`。这会让“刚保存配置就测试失败”变成高频痛点，我先修这一组。

### Assistant
_2026-05-12 22:10:00_

这类配置问题很适合加测试兜住，我补一个专门的配置测试：确认部分更新不会清空已保存的 API Key，也不会把缺省字段写坏。

### Assistant
_2026-05-12 22:10:31_

配置链路修完了，我先跑类型和新增测试，确认没有把现有行为带偏。

### Assistant
_2026-05-12 22:11:05_

下一步我把 DOCX 产物本身加一层“出厂检查”。生成成功不应该只等于脚本没报错，还要确认包结构、主文档 XML、核心文件都存在。

### Assistant
_2026-05-12 22:12:04_

我把 Python 生成器加了 `validate` 子命令，并且生成后会立即做包结构校验。现在跑一遍脚本级验证。

### Assistant
_2026-05-12 22:12:17_

DOCX 校验跑通了，我把刚才的测试产物清掉，再继续补 TypeScript 侧的调用验证。

### Assistant
_2026-05-12 22:13:33_

我补了 TypeScript 包装层的 DOCX 校验接口和一条端到端小测试：Markdown 进来，DOCX 出去，再用 Python 校验包结构。现在跑全套本地测试面。

### Assistant
_2026-05-12 22:14:04_

测试抓到一个很好的边界：在沙箱/符号链接路径下，安全路径检查会把“同一个目录的不同真实路径表示”误判成非法。这个不是测试噪音，是真实可移植性问题，我修掉。

### Assistant
_2026-05-12 22:14:37_

路径安全修正完成，我重新跑刚才失败的测试组和构建。

### Assistant
_2026-05-12 22:15:03_

现在配置、路径和 DOCX 结构校验都过了。我再做一轮审查，找下一个最影响“可直接用”的点。

### Assistant
_2026-05-12 22:16:15_

我接着把 Obsidian/Markdown 到 DOCX 的适配再抬一截：硬换行的正文会合并成自然段，缩进列表会保留层级，这对本地 Obsidian 文档转正式 Word 很关键。

### Assistant
_2026-05-12 22:17:20_

Obsidian 适配改完了，我用一个带硬换行和嵌套列表的小样本直接生成并校验。

### Assistant
_2026-05-12 22:17:44_

DOCX 有效，我再抽查一下 XML 里硬换行正文确实合并了，列表层级也落成不同缩进。

### Assistant
_2026-05-12 22:18:15_

抽查里列表缩进已经能看到不同层级，不过正文合并的字符串匹配没命中；我复查一下 XML 内容，确认是匹配方式问题还是合并逻辑还有漏。

### Assistant
_2026-05-12 22:18:27_

复查确认是匹配条件太死：正文已经合并为一个自然段，只是在合并处保留了空格。这个对 Word 阅读是正确的。我清理测试文件。

### Assistant
_2026-05-12 22:20:03_

我会沿着“DOCX-first + Obsidian 到正式 Word”的主线继续推进：先快速复核当前代码状态，再挑能明显降低你手工排版成本的点直接落地。先加载一下适用的技能说明，避免把已有路线带偏。

### Assistant
_2026-05-12 22:20:29_

技能上我会用 `docx` 的 Word 结构/校验规则做底线；`brainstorming` 的完整审批流程这次我不打断执行，因为你已经连续明确“开始改/继续推进”。我先做一轮高信号代码审查，重点找那些会影响“Obsidian 写完就能出正式 DOCX”的短板。

### Assistant
_2026-05-12 22:20:52_

我已经看到上一轮把 Python 生成链打通了，真正的瓶颈现在在 Markdown 语义到 Word 版式的映射：列表还在手打符号，Obsidian 的链接、任务、callout、脚注等还没被正式化。下一步我会优先把这层变“交付友好”，因为它直接决定你从 Obsidian 拿出去能不能少修。

### Assistant
_2026-05-12 22:21:59_

代码审查结论很明确：当前主链能出 DOCX，但还没有把 Obsidian 常见语法“降噪并正式化”；同时列表用 `•` 写死，Word 里不是原生编号，后期改样式会麻烦。我准备改 Python 生成器这一层，把它变成真正的 Markdown/Obsidian 到 DOCX 适配器。

### Assistant
_2026-05-12 22:24:33_

开始动核心文件 `scripts/docforge_py.py`。这次改动会让生成器理解 Obsidian 前置元数据、内部链接、外链、任务列表、callout、脚注和图片引用，并把普通列表改成 Word 原生列表样式，少一点“看起来像 Word、其实还是纯文本”的毛刺。

### User
_2026-05-12 22:31:13_

继续

### Assistant
_2026-05-12 22:31:38_

继续推进。刚才已经替换了解析核心，现在我把“解析出来的语义”真正落到 Word XML/段落样式上，尤其是列表、callout、图片占位和脚注这几块。

### Assistant
_2026-05-12 22:35:23_

核心落点已经接上了：列表不再手工拼符号，Obsidian callout 会变成带标题的提示块，脚注会集中成“注释”节，外链会落成 Word 超链接。本轮再补测试，专门验证这些 Obsidian 语法在生成后的 DOCX XML 里确实存在。

### Assistant
_2026-05-12 22:36:41_

第一轮编译已经过了：Python 语法和 TypeScript 构建都没炸。现在跑聚焦测试，尤其看新加的 Obsidian 语法测试是否能从生成的 `.docx` 包里读到预期 Word 结构。

### Assistant
_2026-05-12 22:37:05_

测试暴露的是读取测试里的 Windows 编码问题，不是 DOCX 内容坏了：Python `print()` 走控制台编码后中文变成乱码。我会把测试里的解包读取改成原始 UTF-8 字节输出，再复跑。

### Assistant
_2026-05-12 22:37:41_

聚焦测试现在过了，新增的 Obsidian 适配被验证到了：列表样式、callout、脚注、链接关系都进入了 `.docx` 包。接着我跑完整构建和 Web 构建，防止后端改动把前端/打包链路牵坏。

### Assistant
_2026-05-12 22:38:30_

构建、Web 构建和 `git diff --check` 都过了；`diff --check` 只有 Windows 换行提示，没有空白错误。接下来我同步项目文档，把这次“Obsidian 到 DOCX”的能力写进去，避免 README/维护文档还停留在旧能力边界。

### Assistant
_2026-05-12 22:41:04_

文档也同步了，现在 README 会明确告诉使用者：Obsidian 的 Markdown 不是最终交付物，DocForge 会尽量把它转成正式 Word 结构。最后我再跑一次关键测试和构建，确认文档更新之外代码仍干净。

### Assistant
_2026-05-12 22:42:26_

我再补一个更直接的入口：`docforge convert xxx.md`。这样你从 Obsidian 导出/复制出来的 Markdown，不必走“AI 生成”流程，也能直接变成正式 DOCX；这比只在底层脚本支持更顺手。

### Assistant
_2026-05-12 22:44:02_

`convert` 命令已经接进 CLI 并通过 TypeScript 构建。为了确认真实入口能跑，我用项目 README 当作一份 Markdown 烟测输入，输出到 `C:\tmp` 后再用 Python 校验生成的 DOCX 包结构。

### Assistant
_2026-05-12 22:44:19_

烟测撞到一个很实际的 Windows 问题：输出到 `C:\tmp` 时临时文件名前缀是点号，`python-docx` 在这个沙箱路径下写入被拒绝。这个值得修，不能让“先写临时文件再落成品”的稳健策略变成 Windows 路径坑。我会把临时 DOCX 文件名改成普通前缀。

### Assistant
_2026-05-12 22:45:33_

确认了，不是文件名问题，是当前进程对 `C:\tmp` 实际没有写权限，虽然环境声明里列了这个目录；这类环境差异不能影响项目。改动本身没问题，我改用项目 `output/` 做 CLI 烟测，同时顺手修 CLI 顶层错误时退出码仍为 0 的问题。

### Assistant
_2026-05-12 22:46:57_

CLI 烟测成功：`README.md -> output\docforge_cli_convert_smoke.docx` 生成并通过 `.venv` 下的 DOCX 包校验；我也把这个烟测文件清掉了，避免污染你的历史输出列表。最后跑一组完整收口验证。

### Assistant
_2026-05-12 22:47:59_

继续推进了一大步，核心是把项目从“能生成 DOCX”推进到“Obsidian/Markdown 能更像正式 Word 交付件”。

这轮主要改了：

- [scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py)：增强 Obsidian Markdown 解析，支持 frontmatter 清理、内部链接降噪、外链转 Word 超链接、任务列表、callout、脚注转文末注、图片引用、代码块语言标题、表格单元格链接。
- [src/services/python-docx.ts](F:/1work/xyjk_Proposal/src/services/python-docx.ts)：支持 `assetRoot`，修复临时 DOCX 输出策略，避免 Windows 临时路径坑。
- [src/cli.ts](F:/1work/xyjk_Proposal/src/cli.ts)：新增 `convert` 命令，可以直接把 Obsidian/Markdown 转成 DOCX：
  ```bash
  node dist/cli.js convert "D:\Vault\方案.md" --template templates\正式模板.docx
  ```
- [tests/python-docx.test.ts](F:/1work/xyjk_Proposal/tests/python-docx.test.ts)：新增 Obsidian 语法回归测试，直接解包 `.docx` 校验 Word XML 结构。
- [README.md](F:/1work/xyjk_Proposal/README.md) 和 [claude.md](F:/1work/xyjk_Proposal/claude.md)：同步 DOCX-first 和 Obsidian 到 DOCX 能力说明。

验证已通过：

```bash
npx vitest run tests\config-manager.test.ts tests\path-safety.test.ts tests\python-docx.test.ts
npm run build
npm run web:build
.venv\Scripts\python.exe -m py_compile scripts\docforge_py.py
```

还做了 CLI 烟测：`README.md -> DOCX` 生成成功，并用 `.venv` 下的 Python 校验 DOCX 包结构通过。`git diff --check` 也通过，只有 Windows CRLF 换行提示。

### User
_2026-05-12 22:48:45_

继续开启agentteams把项目推进到极致

### Assistant
_2026-05-12 22:49:19_

收到，开启 agent teams。我会把任务拆成几条互不踩文件的线并行推进：我本地先抓主线和集成点，同时让子 agent 分别做 Web 体验、CLI/测试、DOCX 结构增强方向的侦察/补丁。

### Assistant
_2026-05-12 22:51:07_

三个子 agent 已经启动：前端入口、CLI/测试、DOCX 生成链审查。我这边先做不冲突的后端主线，把 `/api/convert/markdown` 接出来，这样 Web 和 CLI 能共享同一条“Obsidian 文档直接出 Word”的能力。

### Assistant
_2026-05-12 22:51:41_

后端 endpoint 我会按安全边界做：模板样式只能来自 `templates/` 内文件；输出只落到 `output/`；Web 的 `assetRoot` 不开放任意文件系统路径，默认用模板目录，CLI 仍保留本机 Obsidian vault 的自由路径能力。这样本地工具好用，Web API 又不会变成任意文件读取入口。

### Assistant
_2026-05-12 22:54:56_

后端编译和核心测试已经过。我现在做一次真实 API 烟测：临时启动编译后的 Express 服务，POST 一段 Obsidian Markdown 到 `/api/convert/markdown`，确认能落 DOCX，再把烟测产物和临时服务清掉。

### Assistant
_2026-05-12 22:56:29_

本地后端主线已经落地并实测通过：`/api/convert/markdown` 会把 Markdown 写成 `.md` 预览和 `.docx` 成品，输出安全落到 `output/`。我现在去收 agent 结果，挑能稳定合入的部分继续接上。

### User
_2026-05-12 22:56:32_

<subagent_notification>
{"agent_path":"019e1cab-51e8-7481-aa68-b4b6024142ab","status":{"completed":"已按只读审查完成，没有改文件，也没有运行会改仓库内容的命令。\n\n**高优先级建议**\n\n1. **标题只是视觉样式，不是 Word 原生标题，TOC/导航窗格不可用**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:744) `add_paragraph_with_style`、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:1096) `markdown_to_docx`  \n   现在 `# / ## / ###` 只调用 `set_paragraph_format` 和 `add_inline_runs`，没有设置 `Heading 1/2/3` 样式，也没有 `outlineLvl`。这会直接增加手工修整成本：领导文档常要目录、导航、自动编号引用。  \n   修法：为 `title/heading1/heading2/heading3` 映射 Word 原生样式，或创建基于 `Heading 1/2/3` 的中文样式；段落保留模板字体，但必须写入 `w:pStyle` 和 `w:outlineLvl`。然后加 `--toc` 或默认在首个标题后插入 TOC field，并在 `settings.xml` 写 `w:updateFields`。\n\n2. **脚注被降级成上标文本 + 文末“注释”，不是 Word 原生脚注**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:386) `parse_inline`、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:974) `add_footnotes_section`  \n   `[^1]` 被转成普通上标 `[1]`，定义集中写到文末。这保住了内容，但正式 DOCX 里脚注无法自动跳转、编号、分页，也不能用 Word 脚注区域。  \n   修法：解析阶段建立 `footnote_id -> number/content`；生成阶段插入 `w:footnoteReference`，同时写 `word/footnotes.xml`、关系和 content type。若先不做原生脚注，至少改名为“文末注”并提供 `--native-footnotes` 路径，避免用户误以为是脚注。\n\n3. **编号列表依赖内置样式名，不能可靠表达正式编号体系**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:804) `apply_list_style`、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:594) 有序列表解析  \n   当前用 `'List Number' / 'List Bullet'` 样式，忽略 Markdown 原始起始编号 `number`，嵌套最多压到 2 级，跨段落/混合列表的 restart/continue 不可控。中文正式文档最常见的“一、（一）1.”会大量手修。  \n   修法：不要只设样式名，生成显式 `w:numPr`。定义多级 abstractNum：一级 `chineseCountingThousand` 或手写“一、”，二级“（一）”，三级“1.”；解析时跟踪连续 list block，为每个 block 分配 `numId`，支持 startOverride。\n\n4. **图片支持只覆盖独占一行，且路径边界不安全**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:388) `parse_inline`、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:701) `add_inline_runs`、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:873) `resolve_asset_path`  \n   行内图片被解析出 `image_ref` 后没有处理，只有单独一行图片会进 `add_image`。Obsidian 的 `![[图.png|300x200]]` 现在把尺寸当 caption。更麻烦的是 `resolve_asset_path` 允许绝对路径，也允许 `asset_root / ../../secret.png` 逃出附件根目录。  \n   修法：解析图片尺寸和 caption，支持行内图片转独立图片段落；只允许解析到 `asset_root.resolve()` 下的文件，除非 CLI 明确加 `--allow-absolute-assets`；限制扩展名和文件大小；远程图片要么下载到受控缓存，要么明确报“远程图片未嵌入”。\n\n5. **表格解析和布局太弱，正式表格会大量返工**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:603) 表格解析、[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:931) `add_table`  \n   解析直接 `split('|')`，不支持 escaped pipe、对齐行、列宽策略、多行单元格。生成固定 `6.2` 英寸，不根据页面边距计算内容宽；所有单元格居中，表头不设置重复标题行。  \n   修法：引入 Markdown 表格 tokenizer，至少处理 `\\|` 和 `:---:` 对齐；根据 `section.page_width - margins` 计算表宽；写入 `tblGrid/tcW`；表头设置 `w:tblHeader`；正文默认左对齐或按列类型推断数字右对齐。\n\n6. **模板样式提取没有带走模板的 Word 结构资产**  \n   位置：[scripts/docforge_py.py](F:/1work/xyjk_Proposal/scripts/docforge_py.py:994) `extract_styles_from_docx`  \n   目前主要抽 Normal、Heading 1-3、边距、前 120 段样式。没有提取页面大小/方向、页眉页脚、标题样式 ID、编号定义、表格样式、图注样式。结果是“像模板字体”，但不像模板文档。  \n   修法：样式 JSON 升级为 `document_profile`：`page_size/orientation/header/footer/styles/numbering/table/caption`。生成时可从模板 docx 开新文档或复制 styles.xml、numbering.xml、settings.xml，再填正文。\n\n7. **Python 子进程没有超时/输出限制，失败时稳定性不足**  \n   位置：[src/services/python-docx.ts](F:/1work/xyjk_Proposal/src/services/python-docx.ts:91) `runPythonScript`、[src/services/python-docx.ts](F:/1work/xyjk_Proposal/src/services/python-docx.ts:155) `generateDocxWithPython`  \n   子进程可无限挂住，`stdout/stderr` 无限累积。替换输出时先 `unlinkSync(outputPath)` 再 `renameSync`，如果 rename 失败会丢旧文件。  \n   修法：给 `runPythonScript` 加 timeout、max stderr/stdout、kill 逻辑；输出用同目录临时 `.docx`，校验通过后 `rename` 覆盖，避免先删旧文件；失败信息带 stderr 尾部和命令阶段。\n\n8. **测试现在验证“包含文本”，没有验证 Word 原生结构**  \n   位置：[tests/python-docx.test.ts](F:/1work/xyjk_Proposal/tests/python-docx.test.ts:62)  \n   当前测试名叫 “delivery-ready Word structures”，但断言主要是文本、超链接和 `w:pStyle w:val=\"List`。没有检查 `w:numPr`、`footnotes.xml`、`Heading1`、TOC field、图片 relationship、`tblGrid/tcW`。  \n   修法：新增 XML 结构断言：标题必须有 `Heading1/2` 或 `outlineLvl`；列表必须有 `w:numPr`；脚注必须有 `word/footnotes.xml`；TOC 必须有 `TOC \\\\o \"1-3\"` field；图片必须有 `word/media/*` 和 image relationship；表格必须有 `w:tblGrid` 和单元格宽度。\n\n**建议下一轮先做的顺序**\n\n先做 `标题原生化 + TOC`，这是投入最小、收益最大的改动。然后做 `脚注原生化` 和 `多级编号`，这两个最影响正式文档手工修整。图片路径边界建议同步修，因为它既影响交付完整性，也有安全风险。"}}
</subagent_notification>

### Assistant
_2026-05-12 22:57:00_

审查 agent 的结论很有价值，我先吃掉最高收益的两项：标题原生化 + 自动目录域。这会让生成的 Word 能进导航窗格、目录可更新，是真正减少后期手工整理的点。

### User
_2026-05-12 22:57:06_

<subagent_notification>
{"agent_path":"019e1cab-25a9-7bb1-83fa-3b9a2b046c6e","status":{"completed":"已完成任务 B，改动范围只在 `tests/`：\n\n新增 [tests/cli-convert.test.ts](F:/1work/xyjk_Proposal/tests/cli-convert.test.ts:1)，覆盖了：\n\n- `convert` 输入文件不存在时返回非 0 退出码\n- `convert` 输入格式不支持时返回非 0 退出码\n- 真实执行 `bin/docforge.js convert`，把 Obsidian/Markdown 转成 DOCX，并验证：\n  - CLI 退出码为 0\n  - 输出 DOCX 文件存在且非空\n  - `validateDocxWithPython` 判断 DOCX 有效\n  - DOCX XML 中包含标题、Obsidian wiki 链接别名、callout、任务状态、外链关系\n  - frontmatter 未进入正文\n\n没有修改 `package.json`，也没有碰 `scripts/docforge_py.py` 或 `src/api/server.ts`。\n\n验证命令已通过：\n\n```powershell\npnpm test tests/cli-convert.test.ts -- --run\npnpm test -- --run\n```\n\n完整结果：4 个测试文件、14 个测试全部通过。"}}
</subagent_notification>

### Assistant
_2026-05-12 22:57:30_

测试 agent 也回来了，已经补了 CLI `convert` 的真实端到端测试，且全量测试通过。现在我会把它和本地后端改动一起纳入收口，同时继续做 Word 原生 Heading/TOC。前端 agent 如果稍后回来，我再合入不冲突部分。

### Assistant
_2026-05-12 22:58:04_

我开始改 Python 生成器的 Word 原生结构：标题段落会写入 `Heading 1/2/3` 或 `Title` 样式，并追加 `outlineLvl`，目录则以 Word TOC 域插入，打开 Word 后可更新。这个改动会让导航窗格/自动目录开始可用。

### User
_2026-05-12 22:59:30_

<subagent_notification>
{"agent_path":"019e1caa-e93b-7152-abbe-5ed1549b903a","status":{"completed":"已完成前端侧增强，未改 `src/api/server.ts`。\n\n改动文件：\n- [web/src/hooks/useApi.ts](F:/1work/xyjk_Proposal/web/src/hooks/useApi.ts)：新增 `convertMarkdownToDocx()`，对接 `POST /api/convert/markdown`，失败时抛出明确错误并刷新历史缓存。\n- [web/src/components/ChatPanel.tsx](F:/1work/xyjk_Proposal/web/src/components/ChatPanel.tsx)：新增“Markdown 直接转 DOCX”入口，可粘贴 Obsidian/Markdown、填写可选文件名、套用当前模板、显示失败态和下载按钮。\n- [web/src/components/HistoryPanel.tsx](F:/1work/xyjk_Proposal/web/src/components/HistoryPanel.tsx)：历史面板改为 DOCX-first 展示，同屏显示 DOCX/MD 数量，更突出最终交付物。\n\n验证命令已执行通过：\n```bash\ncd web\nnpm run build\n```\n\n注意：`src/api/server.ts` 仍是父 agent 的改动状态，我没有触碰后端实现。"}}
</subagent_notification>

### Assistant
_2026-05-12 23:00:01_

前端 agent 已经把 Web 入口补上了，正好能接我刚做的后端 `/api/convert/markdown`。我先检查它的实现，再把 Word 原生标题/目录的测试补上，最后统一跑全量验证。

### Assistant
_2026-05-12 23:00:36_

我发现一个前后端对接细节：前端提示用户可填“项目汇报.docx”，但后端目前只把 `fileName` 当 Markdown 源文件名校验，会拒绝 `.docx`。我会把 API 这边放宽为“用于生成输出名”，允许 `.docx`，避免体验卡住。

### Assistant
_2026-05-12 23:01:51_

我顺手补一个安全口子：图片解析不能让 `asset_root/../../secret.png` 逃出附件目录。CLI 仍能处理本机 vault 内附件，但 Web 和受控转换不会因为 Markdown 图片语法去读任意路径。

### Assistant
_2026-05-12 23:03:19_

下一步我处理稳定性：Python 子进程不能无限挂住，输出也不能无限累积；替换 DOCX 时也不能先删旧文件再 rename。这个是“极致维护”的底盘，避免生成失败时把已有交付物弄没。
