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
  console.log(`\nAPI: ${config.provider} | ${apiStatus}`);
  console.log(`LLM: ${config.llm}`);
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
  console.log(`📁 文件: ${result.filePath}`);
  console.log(`📊 章节数: ${result.sectionCount}`);
  console.log(`📝 字数: ${result.wordCount}`);

  // 等待用户确认后再返回
  await waitForConfirm("按 Enter 返回主界面");
}

/**
 * 基于模板生成文档流程
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
  console.log(`\n已选择模板: ${template}`);

  // 输入新文档主题
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

  // 显示进度 - 新流程：OCR提取 → LLM生成 → 文档合成
  const steps = [
    { icon: '📄', name: 'ocr_extraction', text: 'OCR提取模板样式' },
    { icon: '✨', name: 'content_generation', text: 'LLM生成内容' },
    { icon: '🎨', name: 'document_synthesis', text: '文档合成' },
    { icon: '💾', name: 'saving', text: '保存文件' }
  ];

  let currentStep = 0;
  let stepMessages: string[] = new Array(steps.length).fill('');
  let progressInterval: NodeJS.Timeout | null = null;
  let progressValue = 0;

  // 进度动画
  const showProgress = () => {
    const spin = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠧"];
    const barWidth = 20;
    let frame = 0;
    progressInterval = setInterval(() => {
      // 更新进度条值（只在当前步骤时）
      if (currentStep >= 0 && currentStep < steps.length) {
        const msg = stepMessages[currentStep];
        if (!msg.startsWith('✓') && !msg.startsWith('✗')) {
          progressValue = (progressValue + 5) % 100;
        }
      }

      // 生成进度条
      const filled = Math.round((progressValue / 100) * barWidth);
      const bar = '█'.repeat(filled) + '░'.repeat(barWidth - filled);

      let output = '';
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const msg = stepMessages[i];
        let prefix: string;
        let statusColor = '';
        if (msg.startsWith('✓')) {
          prefix = '✓';
          statusColor = '\x1b[32m';
        } else if (msg.startsWith('✗')) {
          prefix = '✗';
          statusColor = '\x1b[31m';
        } else if (i === currentStep) {
          prefix = spin[frame % 10];
          statusColor = '\x1b[33m';
        } else {
          prefix = ' ';
          statusColor = '';
        }
        output += `${prefix} ${step.icon} ${step.text}`;
        if (msg) {
          output += `\n   ${statusColor}└─ ${msg}\x1b[0m`;
        }
        output += '\n';
      }
      // 添加全局进度条
      output += `\n${bar} ${progressValue}%`;

      // 使用 \r 回车到行首，然后清除多行
      process.stdout.write(`\r\x1b[0G\x1b[J${output}\n\x1b[${steps.length + 2}A`);
      frame++;
    }, 100);
  };

  // 先清屏并显示标题
  console.clear();
  console.log("\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m");
  console.log("\x1b[1;36m  基于模板生成文档\x1b[0m");
  console.log("\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\n");

  showProgress();

  let result;
  try {
    result = await controller.generateDocumentFromTemplate(
      path.join(templatesDir, template as string),
      topic,
      description,
      {
        onProgress: (progress) => {
          const stepIndex = steps.findIndex(s => s.name === progress.step);
          if (stepIndex >= 0) {
            currentStep = stepIndex;
            if (progress.status === 'started') {
              stepMessages[stepIndex] = progress.message || '';
            } else if (progress.status === 'completed') {
              stepMessages[stepIndex] = `✓ ${progress.message || '完成'}`;
            } else if (progress.status === 'error') {
              stepMessages[stepIndex] = `✗ ${progress.message || '失败'}`;
            }
          }
        }
      }
    );
  } catch (error) {
    // 停止进度动画
    if (progressInterval) {
      clearInterval(progressInterval);
      process.stdout.write("\r\x1b[K");
    }

    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31m生成失败: ${errorMsg}\x1b[0m`);

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

  // 显示结果
  console.log("\n\x1b[32m✅ 文档生成完成!\x1b[0m\n");

  // 显示使用的模型（简化版：只需要 OCR + LLM）
  console.log("\x1b[1;36m📊 模型调用链路\x1b[0m");
  console.log(`├─ OCR 模型: ${result.modelsUsed.ocr || '默认样式'}`);
  console.log(`└─ LLM 模型: ${result.modelsUsed.llm}`);

  // 显示使用的样式
  if (result.styleRules) {
    const s = result.styleRules;
    console.log("\n\x1b[1;36m🎨 应用的样式规则\x1b[0m");
    console.log(`├─ 标题: ${s.title.fontFamily} ${s.title.fontSize}pt ${s.title.fontBold ? '加粗' : ''}`);
    console.log(`├─ 正文: ${s.body.fontFamily} ${s.body.fontSize}pt, ${s.body.alignment === 'justify' ? '两端对齐' : s.body.alignment}`);
    console.log(`├─ 行距: ${s.body.lineSpacing || 1.5}倍`);
    console.log(`└─ 页边距: 上下左右各${(s.pageMargin?.top || 1440) / 1440}cm`);
  }

  // 显示生成的文件
  console.log("\n\x1b[1;36m📁 生成文件\x1b[0m");
  console.log(`├─ Markdown: ${result.filePath}`);
  if (result.docxPath) {
    console.log(`└─ DOCX: ${result.docxPath}`);
  } else {
    console.log(`└─ DOCX: 未生成`);
  }

  console.log(`\n📊 章节数: ${result.sectionCount}`);
  console.log(`📝 字符数: ${result.wordCount}`);

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
