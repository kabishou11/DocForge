/**
 * TUI 入口点 - 抄自 OpenCode 架构
 */

import { TuiController } from "./controller";
import { startTui as startTuiCore, waitForConfirm } from "./tui";
import { select, text, cancel, isCancel } from "@clack/prompts";
import * as fs from "fs";
import * as path from "path";
import process from "process";
import { Message } from "./types";

export interface TuiOptions {
  apiKey?: string;
}

/**
 * 显示模型配置对话框
 */
async function showModelConfig(controller: TuiController): Promise<void> {
  const config = controller.getModelConfig();
  const apiStatus = config.hasApiKey ? "已配置" : "未配置";

  console.clear();
  console.log("\x1b[1;36m模型配置\x1b[0m");
  console.log(`\n格式: ${config.format} | ${apiStatus}`);
  console.log(`模型: ${config.model}`);
  console.log(`端点: ${config.baseUrl}`);
  console.log(`OCR: ${config.ocr || '默认样式'}`);
  console.log("\n[1] 设置 API Key");
  console.log("[2] 选择 LLM 模型");
  console.log("[3] 选择 OCR 模型");
  console.log("[4] 测试连接");
  console.log("[Esc] 返回");

  const choice = await text({
    message: "请选择:",
    placeholder: "1-4 或直接回车",
  });

  if (isCancel(choice) || choice === "" || choice === undefined) {
    return;
  }

  const actionMap: Record<string, string> = {
    "1": "api-key",
    "2": "llm",
    "3": "ocr",
    "4": "test",
  };

  const action = actionMap[choice];
  if (!action) {
    return;
  }

  if (action === "api-key") {
    const key = await text({
      message: "请输入 API Key:",
      placeholder: "输入 ModelScope API Key",
    });

    if (isCancel(key) || !key || key === undefined) {
      cancel("已取消");
      return;
    }

    if (controller.setApiKey(key)) {
      console.log("\x1b[32mAPI Key 已设置\x1b[0m");
    } else {
      console.log("\x1b[31mAPI Key 无效\x1b[0m");
    }
    return;
  }

  if (action === "llm") {
    const models = controller.getLLMModels();
    const result = await select({
      message: "选择 LLM 模型:",
      options: models.map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.description,
      })),
    });

    if (!isCancel(result)) {
      controller.setLLM(result as string);
      console.log(`\x1b[32m已选择: ${result}\x1b[0m`);
    }
    return;
  }

  if (action === "ocr") {
    const models = controller.getOCRModels();
    if (models.length === 0) {
      console.log("\n\x1b[33m暂无 OCR 模型\x1b[0m");
      console.log("本地 OCR 模型位置: ./models/");
      console.log("支持的模型: PaddleOCR-VL-1.5");
    } else {
      const result = await select({
        message: "选择 OCR 模型:",
        options: models.map((m) => ({
          value: m.id,
          label: m.name,
          hint: m.description,
        })),
      });

      if (!isCancel(result)) {
        controller.setOCR(result as string);
        console.log(`\x1b[32m已选择: ${result}\x1b[0m`);
      }
    }
    await waitForConfirm("按 Enter 返回");
    return;
  }

  if (action === "test") {
    const result = await controller.testConnection();
    const icon = result.success ? "\x1b[32mOK\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`\n${icon} ${result.message}`);
    if (result.time) {
      console.log(`\x1b[90m响应时间: ${result.time}ms\x1b[0m`);
    }
    await text({ message: "按 Enter 返回" });
  }
}

/**
 * 从零开始生成文档流程
 */
async function runNewDocumentFlow(controller: TuiController): Promise<void> {
  if (!controller.isConfigured()) {
    console.log("\x1b[33m请先配置 API Key。输入 /模型 进行配置。\x1b[0m");
    await waitForConfirm("按 Enter 返回");
    return;
  }

  console.clear();
  console.log("\x1b[1;36m从零开始撰写文档\x1b[0m\n");

  // 1. 输入主题
  const topic = await text({
    message: "请输入文档主题:",
    placeholder: "例如: 人工智能发展趋势分析",
  });

  if (isCancel(topic) || !topic) {
    cancel("已取消");
    return;
  }

  // 2. 输入描述
  const descriptionRaw = await text({
    message: "请输入文档描述 (可选):",
    placeholder: "简要说明文档要涵盖的内容...",
  });
  const description = isCancel(descriptionRaw) ? "" : String(descriptionRaw);

  // 3. 生成大纲
  console.log("\n\x1b[33m正在生成文档大纲...\x1b[0m");

  let outline;
  try {
    outline = await controller.generateOutline(topic, description);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31m生成大纲失败: ${errorMsg}\x1b[0m`);
    await waitForConfirm("按 Enter 返回");
    return;
  }

  // 显示大纲
  console.log("\n\x1b[1;36m文档大纲预览\x1b[0m");
  console.log(`主题: ${topic}`);
  console.log(`描述: ${description || "无"}`);
  console.log(`预估字数: ${outline.wordCount}`);
  console.log("\n章节:");

  for (let i = 0; i < outline.sections.length; i++) {
    const section = outline.sections[i];
    const indent = "  ".repeat(section.level - 1);
    console.log(`${indent}${i + 1}. ${section.title}`);
    if (section.summary) {
      console.log(`${indent}   └─ ${section.summary}`);
    }
  }

  // 确认是否生成
  const confirmResult = await select({
    message: "确认生成此文档?",
    options: [
      { value: "yes", label: "开始生成" },
      { value: "no", label: "取消" },
    ],
  });

  if (isCancel(confirmResult) || String(confirmResult) === "no") {
    cancel("已取消");
    return;
  }

  // 4. 生成文档
  console.log("\n\x1b[33m正在生成文档内容...\x1b[0m");

  // 显示进度
  const steps = [
    "🔍 搜索相关信息",
    "📝 生成章节内容",
    "💾 保存文档",
    "📄 转换为 DOCX"
  ];
  let currentStep = 0;
  let progressInterval: NodeJS.Timeout | null = null;

  // 进度动画
  const showProgress = () => {
    const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠧"];
    let frame = 0;
    progressInterval = setInterval(() => {
      process.stdout.write(`\r\x1b[90m${spin[frame % 10]} ${steps[currentStep] || steps[steps.length - 1]}...\x1b[0m`);
      frame++;
    }, 100);
  };

  showProgress();

  let result;
  try {
    result = await controller.generateDocument(topic, description || "", outline);
  } catch (error) {
    // 停止进度动画
    if (progressInterval) {
      clearInterval(progressInterval);
      process.stdout.write("\r\x1b[K");
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31m生成失败: ${errorMsg}\x1b[0m`);

    // 如果是网络相关错误，给出更详细的提示
    if (errorMsg.includes('aborted') || errorMsg.includes('fetch') || errorMsg.includes('network')) {
      console.log("\x1b[90m提示: 网络连接可能不稳定，请检查后重试。\x1b[0m");
    }

    await waitForConfirm("按 Enter 返回");
    return;
  }

  // 停止进度动画
  if (progressInterval) {
    clearInterval(progressInterval);
    process.stdout.write("\r\x1b[K");
  }

  // 5. 显示结果
  console.log("\n\x1b[32m✅ 文档生成完成!\x1b[0m");
  if (result.docxPath) {
    console.log(`📄 DOCX: ${result.docxPath}`);
  }
  console.log(`📝 Markdown: ${result.filePath}`);
  console.log(`📊 章节数: ${result.sectionCount}`);
  console.log(`📝 字数: ${result.wordCount}`);

  // 等待用户确认后再返回
  await waitForConfirm("按 Enter 返回主界面");
}

/**
 * 基于模板生成文档流程 - 分段生成 + 流式显示
 */
async function runTemplateFlow(controller: TuiController): Promise<void> {
  if (!controller.isConfigured()) {
    console.log("\x1b[33m请先配置 API Key。输入 /模型 进行配置。\x1b[0m");
    await waitForConfirm("按 Enter 返回");
    return;
  }

  console.clear();
  console.log("\x1b[1;36m基于模板生成文档\x1b[0m\n");

  // 查找模板文件
  const templatesDir = "./templates";
  let templateFiles: string[] = [];

  if (fs.existsSync(templatesDir)) {
    templateFiles = fs.readdirSync(templatesDir).filter((f) =>
      f.endsWith(".md") || f.endsWith(".docx") || f.endsWith(".txt")
    );
  }

  if (templateFiles.length === 0) {
    console.log("\x1b[33m未找到模板文件!\x1b[0m");
    console.log("请在 ./templates 目录下放置参考文档 (md/docx/txt)");
    await waitForConfirm("按 Enter 返回");
    return;
  }

  // 选择模板
  const templateResult = await select({
    message: "选择参考模板:",
    options: templateFiles.map((f) => ({
      value: f,
      label: f,
    })),
  });

  if (isCancel(templateResult)) {
    cancel("已取消");
    return;
  }

  const template = String(templateResult);

  // 输入主题
  const topic = await text({
    message: "请输入新文档主题:",
    placeholder: "基于模板风格生成的新文档主题",
  });

  if (isCancel(topic) || !topic) {
    cancel("已取消");
    return;
  }

  // 输入描述
  const descriptionRaw = await text({
    message: "请输入文档描述 (可选):",
    placeholder: "新文档的具体内容要求...",
  });
  const description = isCancel(descriptionRaw) ? "" : String(descriptionRaw);

  // 输入目标字数
  const wordCountRaw = await text({
    message: "目标字数 (可选，默认3000):",
    placeholder: "例如: 2000、5000、8000",
  });
  const wordCountStr = isCancel(wordCountRaw) ? "" : String(wordCountRaw);
  const wordCount = wordCountStr && /^\d+$/.test(wordCountStr.trim())
    ? parseInt(wordCountStr.trim(), 10)
    : 3000;

  // 是否联网搜索
  const searchChoice = await select({
    message: "是否联网搜索最新信息?",
    options: [
      { value: "yes", label: "是，搜索最新资料 (推荐)" },
      { value: "no", label: "否，仅使用模型知识" },
    ],
  });
  const enableSearch = !isCancel(searchChoice) && searchChoice === "yes";

  // ========== 开始生成 ==========
  console.clear();

  // 状态追踪
  let currentPhase = '';
  let sectionTotal = 0;
  let sectionIndex = 0;
  let currentWordCount = 0;
  let streamBuffer = '';
  let streamLines: string[] = [];
  let phaseLog: Array<{ icon: string; text: string; done: boolean; error?: boolean }> = [];

  const addPhase = (icon: string, text: string) => {
    phaseLog.push({ icon, text, done: false });
  };
  const completePhase = (msg?: string) => {
    if (phaseLog.length > 0) {
      const last = phaseLog[phaseLog.length - 1];
      last.done = true;
      if (msg) last.text = msg;
    }
  };
  const failPhase = (msg: string) => {
    if (phaseLog.length > 0) {
      const last = phaseLog[phaseLog.length - 1];
      last.done = true;
      last.error = true;
      last.text = msg;
    }
  };

  // 渲染函数
  const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let frame = 0;
  let renderInterval: NodeJS.Timeout | null = null;

  const render = () => {
    frame++;
    const lines: string[] = [];

    // 标题栏
    lines.push("\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
    lines.push(`\x1b[1;36m  DocForge · ${topic}\x1b[0m`);
    lines.push(`\x1b[90m  模板: ${template} | 目标: ${wordCount} 字 | 搜索: ${enableSearch ? '开启' : '关闭'}\x1b[0m`);
    lines.push("\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
    lines.push('');

    // 阶段日志
    for (const phase of phaseLog) {
      if (phase.done) {
        const icon = phase.error ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
        lines.push(`  ${icon} ${phase.text}`);
      } else {
        lines.push(`  \x1b[33m${spin[frame % 10]}\x1b[0m ${phase.text}`);
      }
    }

    // 章节进度条
    if (sectionTotal > 0 && currentPhase.includes('section')) {
      lines.push('');
      const pct = Math.round(((sectionIndex + 1) / sectionTotal) * 100);
      const barW = 30;
      const filled = Math.round((pct / 100) * barW);
      const bar = '\x1b[36m' + '█'.repeat(filled) + '\x1b[90m' + '░'.repeat(barW - filled) + '\x1b[0m';
      lines.push(`  ${bar} ${pct}%  \x1b[90m章节 ${sectionIndex + 1}/${sectionTotal}\x1b[0m`);
    }

    // 字数统计
    if (currentWordCount > 0) {
      const wpct = Math.min(100, Math.round((currentWordCount / wordCount) * 100));
      lines.push(`  \x1b[90m已生成 \x1b[1;37m${currentWordCount.toLocaleString()}\x1b[0;90m 字 / 目标 ${wordCount.toLocaleString()} 字 (${wpct}%)\x1b[0m`);
    }

    // 流式输出预览（最后 4 行）
    if (streamLines.length > 0) {
      lines.push('');
      lines.push('  \x1b[90m─── 实时预览 ───\x1b[0m');
      const preview = streamLines.slice(-4);
      for (const line of preview) {
        const trimmed = line.slice(0, 70);
        lines.push(`  \x1b[37m${trimmed}\x1b[0m`);
      }
    }

    // 输出
    process.stdout.write('\x1b[H\x1b[J'); // 清屏
    process.stdout.write(lines.join('\n') + '\n');
  };

  renderInterval = setInterval(render, 120);

  let result;
  try {
    result = await controller.generateDocumentFromTemplate(
      path.join(templatesDir, template),
      topic,
      description,
      {
        wordCount,
        enableSearch,
        onProgress: (progress) => {
          currentPhase = progress.step;

          switch (progress.step) {
            case 'template_parse':
              if (progress.status === 'started') {
                addPhase('📄', `解析模板 ${template}...`);
              } else if (progress.status === 'completed') {
                completePhase(`📄 模板解析完成 · ${progress.message}`);
              }
              break;

            case 'outline':
              if (progress.status === 'started') {
                addPhase('📋', '生成文档大纲...');
              } else if (progress.status === 'completed') {
                sectionTotal = progress.sectionTotal || 0;
                completePhase(`📋 大纲生成完成 · ${sectionTotal} 个章节`);
              }
              break;

            case 'section_search':
              if (progress.status === 'started') {
                addPhase('🔍', `搜索: "${progress.searchQuery}"`);
              } else if (progress.status === 'completed') {
                completePhase(`🔍 搜索完成 · ${progress.searchResults || 0} 条参考`);
              }
              break;

            case 'section_generate':
              if (progress.status === 'started') {
                sectionIndex = progress.sectionIndex || 0;
                addPhase('✨', `生成 [${sectionIndex + 1}/${sectionTotal}] ${progress.sectionTitle}`);
                streamBuffer = '';
                streamLines = [];
              } else if (progress.status === 'completed') {
                completePhase(`✨ [${(progress.sectionIndex || 0) + 1}/${sectionTotal}] ${progress.sectionTitle} · ${progress.message}`);
              }
              break;

            case 'section_stream':
              // 流式文本
              if (progress.streamChunk) {
                streamBuffer += progress.streamChunk;
                streamLines = streamBuffer.split('\n').filter(l => l.trim());
              }
              if (progress.wordCount) {
                currentWordCount = progress.wordCount;
              }
              break;

            case 'docx_generate':
              if (progress.status === 'started') {
                addPhase('📦', '生成 DOCX 文档...');
              } else if (progress.status === 'completed') {
                completePhase(`📦 DOCX 生成完成 · ${progress.message}`);
                if (progress.wordCount) currentWordCount = progress.wordCount;
              }
              break;

            case 'error':
              failPhase(`❌ ${progress.message}`);
              break;
          }
        }
      }
    );
  } catch (error) {
    if (renderInterval) clearInterval(renderInterval);
    render(); // 最终渲染

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\n\x1b[31m${errorMsg}\x1b[0m`);

    if (errorMsg.includes('aborted') || errorMsg.includes('fetch') || errorMsg.includes('network')) {
      console.log("\x1b[90m提示: 网络连接可能不稳定，请检查后重试。\x1b[0m");
    }

    await waitForConfirm("按 Enter 返回");
    return;
  }

  // 停止渲染
  if (renderInterval) clearInterval(renderInterval);

  // 最终结果
  console.clear();
  console.log("\x1b[1;32m");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║         ✅ 文档生成完成!              ║");
  console.log("  ╚══════════════════════════════════════╝");
  console.log("\x1b[0m");

  console.log(`  \x1b[1;36m📊 生成统计\x1b[0m`);
  console.log(`  ├─ 章节数: ${result.sectionCount}`);
  console.log(`  ├─ 总字数: ${result.wordCount.toLocaleString()}`);
  console.log(`  └─ LLM: ${result.modelsUsed.llm}`);

  console.log(`\n  \x1b[1;36m📁 输出文件\x1b[0m`);
  console.log(`  ├─ Markdown: ${result.filePath}`);
  if (result.docxPath) {
    console.log(`  └─ DOCX: ${result.docxPath}`);
  }

  await waitForConfirm("\n按 Enter 返回主界面");
}

/**
 * 启动 MCP 服务器（自动启动）
 */
let mcpServerStarted = false;
async function startMCPServer(): Promise<boolean> {
  if (mcpServerStarted) return true;

  try {
    const { startServer } = await import('../mcp-server.js');
    await startServer();
    mcpServerStarted = true;

    // 等待服务器启动
    await new Promise(resolve => setTimeout(resolve, 500));
    return true;
  } catch (error) {
    console.warn(`⚠️  启动 MCP 服务器失败: ${error}`);
    return false;
  }
}

/**
 * 启动 TUI 界面
 */
export async function startTui(options: TuiOptions = {}): Promise<void> {
  // 初始化控制器
  const controller = new TuiController({ apiKey: options.apiKey });

  // 消息历史
  const messages: Message[] = [];

  // 启动 MCP 服务器
  console.log('\x1b[90m正在启动 MCP 服务器...\x1b[0m');
  await startMCPServer();

  // 主循环
  await startTuiCore({
    onCommand: async (cmdId: string) => {
      switch (cmdId) {
        case "new":
          await runNewDocumentFlow(controller);
          break;
        case "template":
          await runTemplateFlow(controller);
          break;
        case "mcp":
          // 显示 MCP 工具状态
          const { MCPTools } = await import("../services/mcp.js");
          const mcp = new MCPTools();
          const status = await mcp.checkStatus();
          console.clear();
          console.log("\x1b[1;36mMCP 工具状态\x1b[0m\n");
          console.log(`服务器: ${status.serverUrl}`);
          console.log(`连接状态: ${status.connected ? '✅ 已连接' : '❌ 未连接'}`);
          console.log(`WebSearch: ${status.webSearch ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`WebFetch: ${status.webFetch ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`get_current_time: ${status.connected ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`calculate_date: ${status.connected ? '✅ 可用' : '❌ 不可用'}`);
          await waitForConfirm("按 Enter 返回");
          break;
        case "skills":
          // 显示 Skills 列表
          const { SkillsManager } = await import("../services/skills-manager.js");
          const manager = new SkillsManager();
          const skills = await manager.getInstalledSkills();
          console.clear();
          console.log("\x1b[1;36mSkills 管理\x1b[0m\n");
          console.log("内置 Skills:");
          const builtinSkills = [
            { name: 'web_search', description: '网络搜索' },
            { name: 'fetch_url', description: '网页内容获取' },
            { name: 'analyze_template', description: '模板分析' },
            { name: 'export_docx', description: 'DOCX 导出' }
          ];
          for (const s of builtinSkills) {
            console.log(`  • ${s.name} - ${s.description}`);
          }
          console.log("\n已安装的 Skills:");
          if (skills.length === 0) {
            console.log("  暂无安装的 Skills");
          } else {
            for (const skill of skills) {
              console.log(`  • ${skill.name}`);
              if (skill.description) {
                console.log(`    ${skill.description}`);
              }
            }
          }
          await waitForConfirm("按 Enter 返回");
          break;
        case "model":
          await showModelConfig(controller);
          break;
        case "settings":
          const settings = controller.getSettings();
          console.clear();
          console.log("\x1b[1;36m项目设置\x1b[0m\n");
          console.log(settings);
          await waitForConfirm("按 Enter 返回");
          break;
        case "help":
          const helpText = `可用命令:
  /0-1 或 /new    从零开始生成文档
  /模板 或 /template  基于模板生成
  /mcp            查看 MCP 工具状态
  /skills         查看已安装的 Skills
  /模型 或 /model    模型配置
  /设置 或 /settings  项目设置
  /列表 或 /list     显示模型列表
  /测试 或 /test     测试连接
  /帮助 或 /help     显示此帮助
  /退出 或 /exit     退出程序

快捷键:
  / 或 Ctrl+P      显示命令菜单
  Ctrl+C           强制退出`;
          console.clear();
          console.log("\x1b[1;36m帮助\x1b[0m\n");
          console.log(helpText);
          await waitForConfirm("按 Enter 返回");
          break;
        case "exit":
          process.exit(0);
          break;
      }
    },
    onSubmit: async (input: string) => {
      // 检查是否直接输入了 API Key
      if (!input.startsWith("/") && !controller.isConfigured()) {
        if (input.length > 10) {
          const success = controller.setApiKey(input);
          if (success) {
            messages.push({ role: "system", content: "API Key 已设置" } as Message);
            const testResult = await controller.testConnection();
            if (testResult.success) {
              messages.push({ role: "system", content: `连接成功! ${testResult.message}` } as Message);
            } else {
              messages.push({ role: "system", content: `连接失败: ${testResult.message}` } as Message);
            }
          } else {
            messages.push({ role: "system", content: "API Key 无效" } as Message);
          }
          return;
        }
      }

      // 命令处理
      if (input.startsWith("/")) {
        const cmd = input.trim().toLowerCase();

        // /0-1 或 /new - 从零开始
        if (cmd === "/0-1" || cmd === "/new" || cmd === "/撰写") {
          await runNewDocumentFlow(controller);
          return;
        }

        // /模板 或 /template
        if (cmd === "/模板" || cmd === "/template") {
          await runTemplateFlow(controller);
          return;
        }

        // /模型 或 /model
        if (cmd === "/模型" || cmd === "/model") {
          await showModelConfig(controller);
          return;
        }

        // /设置 或 /settings
        if (cmd === "/设置" || cmd === "/settings") {
          const settings = controller.getSettings();
          messages.push({ role: "system", content: settings } as Message);
          return;
        }

        // /mcp - MCP 工具状态
        if (cmd === "/mcp" || cmd === "/MCP") {
          const { MCPTools } = await import("../services/mcp.js");
          const mcp = new MCPTools();
          const status = await mcp.checkStatus();
          console.clear();
          console.log("\x1b[1;36mMCP 工具状态\x1b[0m\n");
          console.log(`服务器: ${status.serverUrl}`);
          console.log(`连接状态: ${status.connected ? '✅ 已连接' : '❌ 未连接'}`);
          console.log(`WebSearch: ${status.webSearch ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`WebFetch: ${status.webFetch ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`get_current_time: ${status.connected ? '✅ 可用' : '❌ 不可用'}`);
          console.log(`calculate_date: ${status.connected ? '✅ 可用' : '❌ 不可用'}`);
          await waitForConfirm("按 Enter 返回");
          return;
        }

        // /skills - Skills 管理
        if (cmd === "/skills" || cmd === "/Skills") {
          const { SkillsManager } = await import("../services/skills-manager.js");
          const manager = new SkillsManager();
          const skills = await manager.getInstalledSkills();
          let content = "已安装的 Skills:\n\n";
          if (skills.length === 0) {
            content += "暂无已安装的 Skills\n";
            content += "\n使用 /skills-download 下载 Skills";
          } else {
            for (const skill of skills) {
              content += `• ${skill.name}\n`;
              if (skill.description) {
                content += `  ${skill.description}\n`;
              }
            }
          }
          messages.push({ role: "system", content } as Message);
          return;
        }

        // /帮助 或 /help
        if (cmd === "/帮助" || cmd === "/help" || cmd === "/?") {
          const helpText = `可用命令:
  /0-1 或 /new    从零开始生成文档
  /模板 或 /template  基于模板生成
  /mcp            查看 MCP 工具状态
  /skills         查看已安装的 Skills
  /模型 或 /model    模型配置
  /设置 或 /settings  项目设置
  /列表 或 /list     显示模型列表
  /测试 或 /test     测试连接
  /帮助 或 /help     显示此帮助
  /退出 或 /exit     退出程序`;
          messages.push({ role: "system", content: helpText } as Message);
          return;
        }

        // /列表 或 /list - 显示模型列表
        if (cmd === "/列表" || cmd === "/list") {
          const llmModels = controller.getLLMModels();
          const ocrModels = controller.getOCRModels();
          let content = "可用模型:\n\nLLM 模型:\n";
          for (const m of llmModels) {
            content += `  ${m.name} - ${m.description}\n`;
          }
          content += "\nOCR 模型 (用于样式提取):\n";
          if (ocrModels.length === 0) {
            content += "  使用默认样式规则\n";
          } else {
            for (const m of ocrModels) {
              content += `  ${m.name} - ${m.description}\n`;
            }
          }
          content += "\n说明: 架构已简化，仅需 LLM + OCR (样式提取)";
          messages.push({ role: "system", content } as Message);
          return;
        }

        // /测试 或 /test - 测试连接
        if (cmd === "/测试" || cmd === "/test") {
          const result = await controller.testConnection();
          const icon = result.success ? "OK" : "FAIL";
          messages.push({
            role: "system",
            content: `${icon} ${result.message}${result.time ? ` (${result.time}ms)` : ""}`,
          } as Message);
          return;
        }

        // /退出 或 /exit
        if (cmd === "/退出" || cmd === "/exit" || cmd === "/quit") {
          process.exit(0);
          return;
        }

        messages.push({ role: "system", content: `未知命令: ${input}` } as Message);
        return;
      }

      // 普通聊天消息
      messages.push({ role: "user", content: input } as Message);

      const response = await controller.processChat(input);
      messages.push({ role: "assistant", content: response } as Message);
    },
  });
}

export default startTui;
