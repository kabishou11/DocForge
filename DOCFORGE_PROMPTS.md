# DocForge Prompts - 初版集合

概览
- 目标：提供可重复复用的 prompts，用于 Outline、Section、Quality、Glossary 的文本生成和质量控制。Prompts 以 JSON/结构化输出为目标，便于后续喂入 LLM 与模板引擎。
- 版本：v0.1

1) Outline Prompt

- 目标：基于输入的 topic 与 description 生成文档大纲（Sections）
- 输入变量：topic, description, styleVersion
- 输出格式（JSON）：{ sections: [{ id, title, level, summary }], wordCount }
-  约束：遵循 styleVersion 对应的排版与层级结构，输出应可直接用于生成各章节文本
- 示例输出：
```
{
  "sections": [
    {"id":"sec-1","title":"引言","level":1,"summary":"背景与目的"},
    {"id":"sec-2","title":"目标与范围","level":2,"summary":"系统目标与边界"}
  ],
  "wordCount": "1200-1800"
}
```

2) Section Prompt

- 目标：基于 Outline 的章节信息生成详细文本草案
- 输入变量：section (id, title, level, summary)、topic、styleConstraints
- 输出：纯文本或 markdown，适合直接填充进 DOCX 模板
- 要点：保持结构清晰、论点连贯、符合 style.json 指定的排版风格

示例输入：{ section: { id: 'sec-1', title: '引言', level: 1, summary: '背景与目的' }, topic: '...', styleConstraints: {...} }
- 示例输出：
```
引言
背景与目的：本文档旨在...（示例文本）
```

3) Quality Prompt

- 目标：对整份文档进行质量检查，输出问题清单与修正建议
- 输入变量：documentContent (全文文本或片段)
- 输出：JSON：{ issues: [ { id, sectionId, severity, description, suggestedFix }, ... ] }
- 要点：覆盖术语统一、拼写、语义一致性、章节连贯性、排版一致性

4) Glossary Prompt

- 目标：从文档中提取核心术语，给出统一定义
- 输入变量：documentContent
- 输出：JSON：{ terms: [{ term, definition, occurrences }] }

版本管理与扩展
- Prompts 应与 style.json 版本绑定，随风格的更新进行版本管理
- Prompts 支持变量化输入，并可从 Plan/Context 动态组装最终文本

使用提示
- Prompts 应以变量化输入进行拼接，避免在 prompts 中写死具体文本。实际调用时请使用一个 Prompt Engine 将变量替换为最终文本。
