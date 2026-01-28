# xyjk_Proposal - DocForge CLI 项目

LLM 驱动的文档生成工具，支持通过主题和描述生成 DOCX 文档。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 构建项目
npm run build

# 3. 初始化配置
npm start -- init

# 4. 配置 API Key
# 编辑 .docforgerc 或设置环境变量
set MODELSCOPE_API_KEY=ms-your-api-key

# 5. 生成文档
npm start -- generate -t "无锡住房置业担保系统" -d "线上化改造项目建设方案"
```

## 功能

| 命令 | 说明 |
|------|------|
| `init` | 初始化项目配置 |
| `style` | 管理风格模板 |
| `generate` | 生成 DOCX 文档 |
| `preview` | 预览文档大纲 |
| `sync` | 同步到 GitHub |
| `status` | 查看项目状态 |
| `config` | 配置管理 |

## 项目结构

```
xyjk_Proposal/
├── bin/
│   └── docforge.js           # CLI 入口
├── src/
│   ├── cli.ts                # CLI 命令
│   ├── llm/
│   │   └── client.ts         # LLM 客户端 (ModelScope)
│   ├── docx/
│   │   └── generator.ts      # DOCX 生成器
│   └── workflow/
│       └── document.ts       # 文档生成工作流
├── prompts/                  # Prompts 模板
│   ├── DOCFORGE_PROMPTS.md
│   ├── DOCFORGE_CLAUDE_CODE_GUIDE.md
│   └── DOCFORGE_QUICK_REF.md
├── style.json                # 风格配置
├── .docforgerc               # 项目配置
├── package.json
└── tsconfig.json
```

## LLM 配置

- **API**: ModelScope (OpenAI 兼容)
- **Base URL**: `https://api-inference.modelscope.cn/v1`
- **Model**: `deepseek-ai/DeepSeek-V3.2`
- **支持**: 流式输出、思考模式开关

## 文档

- [DOCFORGE_PLAN.md](DOCFORGE_PLAN.md) - 项目计划
- [DOCFORGE_PROMPTS.md](DOCFORGE_PROMPTS.md) - Prompts 集合
- [prompts/DOCFORGE_CLAUDE_CODE_GUIDE.md](prompts/DOCFORGE_CLAUDE_CODE_GUIDE.md) - Claude Code 开发指南
- [prompts/DOCFORGE_QUICK_REF.md](prompts/DOCFORGE_QUICK_REF.md) - 快速参考

## GitHub 同步

目标仓库: https://github.com/kabishou11/xyjk_-Proposal
