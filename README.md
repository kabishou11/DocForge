<h1 align="center">DocForge - AI 驱动的智能文档生成平台</h1>


<div align="center">
  
![DocForge](https://img.shields.io/badge/DocForge-v0.1.0-blue?style=for-the-badge&logo=rocket)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=for-the-badge&logo=typescript)
![Python](https://img.shields.io/badge/Python-3.13-yellow?style=for-the-badge&logo=python)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

*基于大语言模型的文档自动化生成工具，支持从零生成和模板风格迁移，最终交付 DOCX*

[📖 快速开始](#-快速开始) • [✨ 功能特性](#-功能特性) • [💻 使用示例](#-使用示例) • [📁 项目结构](#-项目结构)

</div>

---

## 📋 简介

DocForge 是一款创新的 AI 文档生成平台，利用大语言模型（LLM）自动生成专业、规范的文档内容。无论是建设方案、技术报告还是合规文档，只需提供主题和描述，即可快速生成高质量、可直接使用的 DOCX 文档。Markdown 只作为开发预览和中间态。

### 🌟 核心亮点

- **🤖 智能生成** - 基于 Qwen3/MiniMax 等强大模型，理解需求后自动生成结构化文档
- **📋 模板风格迁移** - 参考现有文档风格，生成格式统一的新文档
- **📄 DOCX 格式还原** - 使用 Python python-docx 生成格式规范的 DOCX，支持行内混合格式、嵌套列表等高级功能
- **📝 Obsidian 友好** - Markdown 预览只是中间态，Obsidian 的内部链接、任务列表、callout、脚注、表格和图片引用会尽量转换为可交付的 DOCX 结构
- **🖥️ 交互式 TUI** - 提供友好的终端用户界面，支持斜杠命令快速操作
- **🔒 安全可控** - API Key 本地配置，不泄露敏感信息

---

## ✨ 功能特性

| 功能 | 描述 | 状态 |
|------|------|------|
| 从零开始生成 | 输入主题和描述，自动生成完整文档大纲和内容 | ✅ 已完成 |
| 模板风格迁移 | 参考现有 DOCX/Markdown 模板，生成格式统一的新文档 | ✅ 已完成 |
| 交互式 TUI | 终端用户界面，支持斜杠命令 | ✅ 已完成 |
| 模型配置 | 支持切换 LLM/OCR 模型，测试连接 | ✅ 已完成 |
| 文档导出 | 支持导出为 DOCX，Markdown 作为预览/中间态 | ✅ 已完成 |
| Obsidian Markdown 适配 | 支持 frontmatter 清理、内部链接降噪、任务列表、callout、脚注、图片引用 | ✅ 已完成 |
| 进度显示 | 实时显示 OCR 提取、LLM 生成、文档合成进度 | ✅ 已完成 |

---

## 📦 快速开始

### 环境要求

- Node.js >= 18.0
- npm 或 yarn
- Python 3.13 (用于 DOCX 生成)
- ModelScope API Key（用于调用 LLM）

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/kabishou11/DocForge.git
cd DocForge

# 2. 安装 Node.js 依赖
npm install

# 3. 安装 Python 依赖（用于 DOCX 生成）
py -3.13 -m venv .venv
.venv\Scripts\pip install python-docx lxml

# 4. 构建项目
npm run build

# 5. 配置 API Key
set MODELSCOPE_API_KEY=your-api-key
```

### 可选：安装 OCR 模型

项目使用 PaddleOCR-VL-1.5 进行版面识别，仅占用 **2GB 显存**，替代了之前的大参数 VL 多模态模型。

```bash
# 下载 OCR 模型（可选，如需本地版面识别功能）
# 模型下载地址：https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.5
# 将模型文件放置于 ./models/ 目录

# 如不使用本地 OCR，将使用默认样式规则
```

---

## 💻 使用示例

### 交互式 TUI

```bash
# 启动交互式 TUI
npm run tui

# 或使用构建后的命令
node dist/cli.js tui
```

**可用命令：**
- `/0-1` 或 `/new` - 从零开始生成文档
- `/模板` 或 `/template` - 基于模板生成
- `/模型` 或 `/model` - 模型配置
- `/帮助` 或 `/help` - 显示帮助
- `/退出` 或 `/exit` - 退出程序

### 从零开始生成

```
1. 选择 "从零开始撰写"
2. 输入文档主题: "智慧园区建设方案"
3. 输入描述: "包含基础设施、智能化系统、运营管理等模块"
4. 系统生成大纲并展示
5. 确认后生成完整文档
```

### Obsidian / Markdown 直接转 DOCX

```bash
# 使用默认中文正式文档样式
node dist/cli.js convert "D:\Vault\方案.md"

# 使用已有 DOCX 模板提取样式，并解析同目录图片/附件
node dist/cli.js convert "D:\Vault\方案.md" --template templates\正式模板.docx

# 指定输出位置和附件目录
node dist/cli.js convert "D:\Vault\方案.md" -o output\方案.docx --asset-root "D:\Vault"
```

转换时会清理 Obsidian frontmatter/内部链接噪声，并尽量把任务列表、callout、脚注、图片引用、表格和超链接转换为 Word 可编辑结构。

### 基于模板生成

```
1. 选择 "基于模板生成"
2. 选择参考模板文件 (支持 .docx, .md, .txt)
3. 输入新文档主题: "智慧工厂建设方案"
4. 系统基于模板风格生成新文档
5. 输出目录中同时得到 Markdown 预览和最终 DOCX
```

---

## 📁 项目结构

```
DocForge/
├── src/
│   ├── cli.ts                # CLI 入口命令
│   ├── tui/                  # 终端用户界面
│   │   ├── index.ts          # TUI 主入口
│   │   ├── tui.ts            # TUI 核心逻辑
│   │   ├── controller.ts     # TUI 控制器
│   │   └── types.ts          # 类型定义
│   ├── llm/
│   │   └── client.ts         # LLM 客户端 (ModelScope API)
│   ├── services/
│   │   ├── modelscope.ts     # ModelScope 服务封装
│   │   ├── python-docx.ts    # Python DOCX 生成器
│   │   └── mcp.ts            # MCP 工具封装
│   ├── config/
│   │   └── index.ts          # 配置管理
│   └── mcp-server.ts         # MCP 服务器
├── scripts/
│   └── docforge_py.py        # Python DOCX 处理脚本
├── templates/                # 文档模板目录
├── models/                   # OCR 模型目录（可选）
├── .venv/                    # Python 虚拟环境
├── package.json
├── requirements.txt          # Python 依赖
└── tsconfig.json
```

---

## 🛠️ 技术栈

<div align="center">

**核心语言**
📘 TypeScript 5.3

**运行时**
⚡ Node.js 18+

**AI 集成**
🧠 ModelScope API (Qwen3, MiniMax-M2.1 等)

**文档处理**
📄 Python python-docx - DOCX 生成（支持行内混合格式、嵌套列表）
📦 mammoth - DOCX 解析

**OCR 识别**
🎯 PaddleOCR-VL-1.5 - 版面识别（仅 2GB 显存）

**用户界面**
⌨️ @clack/prompts - 交互式提示组件

</div>

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📜 许可证

本项目采用 MIT License - 详见 [LICENSE](./LICENSE) 文件。

---

## 🙏 致谢

- [ModelScope](https://www.modelscope.cn/) - 提供强大的 LLM API
- [Qwen](https://qwen.ai/) - 优质的模型服务
- [PaddlePaddle](https://www.paddlepaddle.org.cn/) - PaddleOCR 开源项目
- [python-docx](https://python-docx.readthedocs.io/) - 强大的 Python DOCX 库
- [@clack/prompts](https://github.com/natemoo-re/clack) - 精美的终端交互组件

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

*Built with ❤️ by DocForge Team*

</div>
