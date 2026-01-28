# DocForge - Claude Code 快速参考

## 一行命令

```bash
# 安装依赖并运行
npm install && npm run build && npm start -- init
```

## 生成文档

```bash
# 基本用法
npm start -- generate -t "无锡住房置业担保系统" -d "线上化改造项目建设方案"

# 带输出路径
npm start -- generate -t "主题" -d "描述" -o ./output/demo.docx

# 调试模式
npm start -- generate -t "主题" -d "描述" --debug
```

## 预览大纲

```bash
npm start -- preview -t "无锡房产系统"
```

## 配置管理

```bash
# 查看配置
npm start -- config

# 查看 LLM 配置
npm start -- config --get llm.model

# 设置 API Key (通过环境变量)
set MODELSCOPE_API_KEY=your-key
```

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MODELSCOPE_API_KEY` | ModelScope API Key | 无 |
| `LLM_BASE_URL` | LLM API 基础URL | `https://api-inference.modelscope.cn/v1` |

---

## LLM 配置

```json
{
  "llm": {
    "baseUrl": "https://api-inference.modelsscope.cn/v1",
    "model": "deepseek-ai/DeepSeek-V3.2"
  }
}
```

---

## 当前风格模板 (style.json)

- 页面: A4 (210mm x 297mm)
- 边距: 上下 25.4mm, 左右 31.7mm
- 中文字体: 宋体
- 英文字体: Calibri
- 正文字号: 小四 (10.5pt)
- 行距: 1.5倍

---

## GitHub 同步

```bash
# 同步到仓库
npm start -- sync --message "docs: 更新文档"
```

目标: https://github.com/kabishou11/xyjk_-Proposal
