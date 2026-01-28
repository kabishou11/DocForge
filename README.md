<div align="center">
# 🚀 DocForge - AI 驱动的智能文档生成平台

![DocForge](https://img.shields.io/badge/DocForge-v0.1.0-blue?style=for-the-badge&logo=rocket)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-green?style=for-the-badge&logo=node.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue?style=for-the-badge&logo=typescript)
![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)

*基于大语言模型的文档自动化生成工具，支持从零生成和模板风格迁移*

[📖 快速开始](#-快速开始) • [✨ 功能特性](#-功能特性) • [💻 使用示例](#-使用示例) • [📁 项目结构](#-项目结构)

</div>

---

## 📋 简介

DocForge 是一款创新的 AI 文档生成平台，利用大语言模型（LLM）自动生成专业、规范的文档内容。无论是建设方案、技术报告还是合规文档，只需提供主题和描述，即可快速生成高质量、可直接使用的文档。

### 🌟 核心亮点

- **🤖 智能生成** - 基于 DeepSeek-V3.2 强大模型，理解需求后自动生成结构化文档
- **📋 模板风格迁移** - 参考现有文档风格，生成格式统一的新文档
- **📄 多格式输出** - 支持 Markdown 和 DOCX 格式输出，满足不同场景需求
- **🖥️ 交互式 TUI** - 提供友好的终端用户界面，支持斜杠命令快速操作
- **🔒 安全可控** - API Key 本地配置，不泄露敏感信息

---

## ✨ 功能特性

| 功能 | 描述 | 状态 |
|------|------|------|
| 🔹 从零开始生成 | 输入主题和描述，自动生成完整文档大纲和内容 | ✅ 已完成 |
| 🔹 模板风格迁移 | 参考现有文档风格，生成格式统一的新文档 | ✅ 已完成 |
| 🔹 交互式 TUI | 终端用户界面，支持斜杠命令 | ✅ 已完成 |
| 🔹 模型配置 | 支持切换 LLM/VL 模型，测试连接 | ✅ 已完成 |
| 🔹 文档导出 | 支持导出为 Markdown 和 DOCX | ✅ 已完成 |
| 🔹 流式输出 | 支持流式响应，边生成边显示 | 🔄 开发中 |
| 🔹 多模板管理 | 支持保存和切换多个风格模板 | 🔄 开发中 |

---

## 📦 快速开始

### 环境要求

- Node.js >= 18.0
- npm 或 yarn
- ModelScope API Key（用于调用 LLM）

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/kabishou11/xyjk_-Proposal.git
cd xyjk_Proposal

# 2. 安装依赖
npm install

# 3. 构建项目
npm run build

# 4. 初始化配置
npm start -- init

# 5. 配置 API Key（任选一种方式）
# 方式一：环境变量
set MODELSCOPE_API_KEY=your-api-key

# 方式二：在 .docforgerc 中配置
```

### 快速使用

```bash
# 启动交互式 TUI
docforge

# 或命令行模式
docforge generate -t "人工智能发展趋势" -d "分析金融和医疗行业应用"

# 预览文档大纲
docforge preview -t "智慧城市建设方案"
```

---

## 💻 使用示例

### 交互式 TUI

```bash
$ docforge

    ██╗██╗     ██╗ ██████╗ ███████╗
    ██║██║     ██║██╔═══██╗██╔════╝
    ██║██║     ██║██║   ██║█████╗
    ██║██║     ██║██║   ██║██╔══╝
    ██║███████╗██║╚██████╔╝███████╗
    ╚═╝╚══════╝╚═╝ ╚═════╝ ╚══════╝
    DocForge v0.1

输入 / 显示命令菜单
```

**可用命令：**
- `/0-1` 或 `/new` - 从零开始生成文档
- `/模板` 或 `/template` - 基于模板生成
- `/模型` 或 `/model` - 模型配置
- `/设置` 或 `/settings` - 项目设置
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

### 基于模板生成

```
1. 选择 "基于模板生成"
2. 选择参考模板文件
3. 输入新文档主题: "智慧工厂建设方案"
4. 系统基于模板风格生成新文档
```

---

## 📁 项目结构

```
xyjk_Proposal/
├── bin/
│   └── docforge.js           # CLI 入口脚本
├── src/
│   ├── cli.ts                # 命令行命令定义
│   ├── tui/                  # 终端用户界面
│   │   ├── index.ts          # TUI 主入口
│   │   ├── tui.ts            # TUI 核心逻辑
│   │   ├── controller.ts     # TUI 控制器
│   │   └── types.ts          # 类型定义
│   ├── llm/
│   │   └── client.ts         # LLM 客户端 (ModelScope API)
│   ├── docx/
│   │   └── generator.ts      # DOCX 文档生成器
│   ├── services/
│   │   └── modelscope.ts     # ModelScope 服务封装
│   ├── config/
│   │   └── index.ts          # 配置管理
│   └── workflow/
│       └── document.ts       # 文档生成工作流
├── templates/                # 文档模板目录
├── output/                   # 生成文档输出目录
├── .docforgerc               # 项目配置文件
├── style.json                # 文档风格配置
├── package.json
└── tsconfig.json
```

---

## ⚙️ 配置说明

### 配置文件 `.docforgerc`

```json
{
  "llm": {
    "baseUrl": "https://api-inference.modelscope.cn/v1",
    "model": "deepseek-ai/DeepSeek-V3.2"
  },
  "github": {
    "owner": "",
    "repo": "xyjk_-Proposal",
    "branch": "main"
  }
}
```

### 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `MODELSCOPE_API_KEY` | ModelScope API Key | ✅ |
| `LLM_BASE_URL` | API 服务器地址 | ❌ |

---

## 📄 生成示例

项目 `output/` 目录包含由 DocForge 生成的示例文档：

- **2026-01-28_3-5年AI发展方向_from_template.md** - 基于模板风格生成的 AI 发展规划报告

这些文档展示了 DocForge 的生成能力，包括：
- 专业的文档结构（一、二、三级标题）
- 详实的内容深度
- 统一的格式风格
- 中文标点符号规范

---

## 🛠️ 技术栈

<div align="center">

**核心语言**
📘 TypeScript 5.3

**运行时**
⚡ Node.js 18+

**AI 集成**
🧠 ModelScope API (DeepSeek-V3.2)

**文档处理**
📄 docx.js - DOCX 生成
📦 mammoth - DOCX 解析

**用户界面**
⌨️ @clack/prompts - 交互式提示

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

## 📝 更新日志

See [CHANGELOG.md](./CHANGELOG.md) for more information.

---

## 📜 许可证

本项目采用 MIT License - 详见 [LICENSE](./LICENSE) 文件。

---

## 🙏 致谢

- [ModelScope](https://www.modelscope.cn/) - 提供强大的 LLM API
- [DeepSeek](https://www.deepseek.com/) - 优质的模型服务
- [docx](https://docx.js.org/) - 优秀的 DOCX 生成库
- [@clack/prompts](https://github.com/natemoo-re/clack) - 精美的终端交互组件

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个 Star！**

*Built with ❤️ by DocForge Team*

</div>
