# DocForge - Claude Code 开发指南

版本: v0.1

本文件为 Claude Code 提供开发 DocForge 项目的专属提示词。

---

## 项目概述

**DocForge** 是一个以 CLI 为核心的文档生成工具，通过 LLM 生成文档内容，结合风格模板输出 DOCX  **核心功能**:格式文档。

- 主题 → 大纲 → 章节内容 → DOCX
- **目标仓库**: https://github.com/kabishou11/xyjk_-Proposal
- **LLM**: ModelScope DeepSeek-V3.2 (OpenAI 兼容接口)

---

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript
- **LLM 客户端**: OpenAI 兼容 API (ModelScope)
- **DOCX 生成**: docx 库
- **CLI**: commander
- **测试**: Vitest

---

## 项目结构

```
xyjk_Proposal/
├── bin/
│   └── docforge.js           # CLI 入口脚本
├── src/
│   ├── cli.ts                # CLI 命令实现
│   ├── llm/
│   │   └── client.ts         # LLM 客户端 (ModelScope)
│   ├── docx/
│   │   └── generator.ts      # DOCX 生成器
│   └── workflow/
│       └── document.ts       # 文档生成工作流
├── prompts/                  # Prompts 模板库
│   ├── DOCFORGE_PROMPTS.md
│   ├── DOCFORGE_CLAUDE_CODE_GUIDE.md
│   └── DOCFORGE_QUICK_REF.md
├── style.json                # 风格配置
├── .docforgerc               # 项目配置
├── package.json
└── tsconfig.json
```

---

## LLM 调用规范

### ModelScope API (OpenAI 兼容)

```typescript
// 基础 URL 和 API Key
base_url: 'https://api-inference.modelscope.cn/v1'
model: 'deepseek-ai/DeepSeek-V3.2'
```

### 启用思考模式

```typescript
const extra_body = {
  "enable_thinking": true  // 或 false 禁用
};
```

### 流式响应处理

```typescript
for await (const chunk of llm.chatStream({
  model: 'deepseek-ai/DeepSeek-V3.2',
  messages: [{ role: 'user', content: '...' }],
  enableThinking: true
})) {
  if (chunk.choices[0]?.delta.content) {
    process.stdout.write(chunk.choices[0].delta.content);
  }
}
```

---

## 开发准则

### 1. 代码风格
- 使用 TypeScript 严格模式
- 遵循 ESLint/Prettier 规范
- 每个函数/类需有 JSDoc 注释

### 2. 错误处理
- CLI 命令必须处理错误并提供友好的错误信息
- LLM 调用需要重试机制 (指数退避)
- 验证所有用户输入

### 3. 配置文件
- 所有配置通过 `.docforgerc` 管理
- 环境变量覆盖配置文件: `LLM_BASE_URL`, `MODELSCOPE_API_KEY`

### 4. 兼容性
- 确保 Node.js 18+ 兼容
- 使用 CommonJS 模块 (便于 CLI 执行)
- 避免使用实验性 API

---

## 常用命令

```bash
# 开发
npm run dev -- generate -t "主题" -d "描述"
npm run dev -- preview -t "主题"

# 构建
npm run build

# 运行 CLI
npm start -- init
npm start -- style show
npm start -- generate -t "无锡房产系统" -d "线上化改造"

# 测试
npm test
```

---

## Prompts 使用

### Outline Prompt

```typescript
const outline = await llmClient.generateOutline(topic, description, styleVersion);
```

输入变量:
- `topic`: 文档主题
- `description`: 详细描述
- `styleVersion`: 风格版本号

输出格式:
```json
{
  "sections": [
    {"id": "sec-1", "title": "引言", "level": 1, "summary": "背景与目的"}
  ],
  "wordCount": "1200-1800"
}
```

### Section Prompt

```typescript
const content = await llmClient.generateSection(section, topic, styleConstraints);
```

输入变量:
- `section`: 大纲章节对象
- `topic`: 文档主题
- `styleConstraints`: 风格约束

---

## GitHub 同步

### 目标仓库
- **URL**: https://github.com/kabishou11/xyjk_-Proposal
- **主分支**: main
- **同步内容**: 生成的 DOCX 文档、配置文件、代码

### 同步策略
1. 创建特性分支: `feature/docs-{topic}`
2. 提交更改: `docs: add {topic} document`
3. 创建 PR 或直接推送到 main

---

## 质量检查

在生成文档后，使用以下检查:

1. **术语一致性**: 检查专业术语使用是否统一
2. **格式一致性**: 检查标题层级、段落格式
3. **内容完整性**: 检查大纲章节是否完整覆盖
4. **语言质量**: 检查语法、表达清晰度

---

## 快速修复模板

当发现问题时，使用以下修复流程:

```
1. 确认问题: 复现问题并记录
2. 分析根因: 定位到具体代码/配置
3. 制定方案: 提出修复方案
4. 实现修复: 修改代码
5. 测试验证: 确认问题已解决
6. 更新文档: 记录修复经验
```

---

## 常见问题

### Q: LLM API 调用失败
A: 检查网络、API Key、模型名称是否正确

### Q: DOCX 格式错误
A: 检查 style.json 配置是否有效

### Q: 章节内容不连贯
A: 调整 prompts 中的上下文说明

---

## 版本管理

- **style.json**: 版本化风格配置
- **package.json**: 语义化版本
- **CHANGELOG.md**: 记录重要变更

---

> 本文件由 DocForge 自动生成，用于指导 Claude Code 开发本项目。
