# DocForge - Plan (CLI 核心实现)

版本: v0.1

背景与目标
- 本项目聚焦在以 CLI 为核心的文档生产工作流，支持基于主题和描述通过 LLM 生成文档文本、应用模板风格（style.json）、输出 DOCX，并具备 GitHub 同步与 MCP 集成的能力。后续扩展前端 UI（Web UI/TUI）作为可选增强。
- MVP 方案将覆盖：初始化配置、风格模板、文档生成、预览、同步与状态查询等核心能力。Prompts（Outline/Section/Quality/Glossary）将作为初版文本模板，后续替换为实际大模型调用文本。

范围与边界
- MVP 的最小可用命令集：init、style、generate、preview、sync、status、config。
- 产出格式：DOCX 文档，风格驱动由 style.json 控制，文本内容通过 Prompts 的输出填充。
- LLM 客户端提供 Mock 实现，后续对接 ModelScope/OpenAI，确保本地开发与 CI 能力。
- Prompts 库在 prompts/ 目录下，作为对大模型输出的结构化输入模板，方便后续替换为真实 API 调用文本。

架构总览
- CLI 层：入口点，解析参数，输出进度与日志，提供以下命令：init、style、generate、preview、sync、status、config。
- core.llm：统一的 LLM 客户端接口，支持流式输出和"思考/Thinking"控制（开关）。当前为 Mock 实现。
- core.style： style.json 的加载、字段校验与默认值管理。
- core.template：模板管理，加载基线 DOCX 模板，映射文本到占位符，应用排版风格。
- core.docx：DOCX 生成引擎，负责文本填充与风格应用，输出最终文档。
- prompts：Prompts 库，包含 Outline、Section、Quality、Glossary 等初版模板（prompts/DOCFORGE_PROMPTS.md）供替换。
- workflow.github：GitHub 同步与分支策略实现，准备支持分支创建、提交、PR 等。
- adapters.mcp：MCP 集成点，文档生成完成后触发同步任务。
- tests：测试用例与集成测试，确保核心组件稳定。

风格模板与风格管理
- style.json 初版结构（版本化）包含：page、font、paragraph、headingStyles、listStyles、styles 等字段。
- 风格描述体现两份模板要点的可复用字段，后续版本将进行合并与向后兼容性处理。
- 风格文件的加载与默认值逻辑，确保即使没有 style.json 也能运行最小 MVP。

Prompts 库（Prompts 初版）
- Outline Prompt：基于 topic 与 description 输出文档大纲（sections： [{id, title, level, summary}]，wordCount）
- Section Prompt：根据章节信息输出详细文本草案，遵循 style.json 指定的排版要求
- Quality Prompt：对文档执行质量检查，输出 JSON 形式的问题清单与修正建议
- Glossary Prompt：提取核心术语并给出统一定义，输出 JSON
- Prompts 的版本化与变量化设计，准备与 style.json 的版本一一对应

最小可运行实现要点
- CLI：init、style、generate、preview、sync、status、config，最小参数支持即可初版运行
- 生成流程：topic + description → Outline（prompts） → Section（prompts） → 模板填充 → DOCX 输出
- LLM 客户端：提供 Mock 实现，后续可对接真实模型
- 模板驱动：加载一个基线 Docx 模板，应用 style.json，填充文本
- GitHub/MCP：初步以日志/占位形式演示，后续扩展为实际推送与触发

里程碑（阶段性计划）
- Milestone 1（0-2 周）：CLI 框架搭建、generate 的最小可用实现、风格 JSON 初版、Prompts 初版、DOCX 输出单元测试
- Milestone 2（2-4 周）：GitHub 同步与 MCP 集成雏形、质量保障（术语表/拼写/排版检查）
- Milestone 3（4-6 周）：开发者文档、使用示例、快速上手指南、CI/CD 集成
- Milestone 4（后续）：前端 UI 的可选扩展、风格模板的丰富扩展、跨语言支持

准备工作清单
- Node.js 18+、TypeScript、Vitest/Jest、ESLint/Prettier
- 模板文档（两份模板风格要点）用于 style.json 的参考
- LLM 接入凭据（OpenAI/ModelScope）及 GitHub/MCP 的令牌
- 目标仓库及分支策略定义
- 版本控制策略、测试计划、发布/回滚计划

快速上手
- 克隆仓库后，执行 npm install，运行 npm run build，使用 CLI 来初始化与生成示例文档
- 示例命令：
  - docforge init
  - docforge style
  - docforge generate -t "主题示例" -d "描述文本..." -o ./output/demo.docx

后续工作与对接
- 将生成的文档推送到 xyjk_-Proposal 仓库，触发 MCP 与 DocForge 的后续工作流
- 直接将 Plan 与 Prompts 的内容嵌入到文档中的特定章节位置，形成可追溯的计划文件与 Prompts 参考
