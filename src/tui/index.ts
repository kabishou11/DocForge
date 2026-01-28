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
  console.log(`VL: ${config.vl}`);
  console.log("\n[1] 设置 API Key");
  console.log("[2] 选择 LLM 模型");
  console.log("[3] 选择 VL 模型");
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
    "3": "vl",
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

  if (action === "vl") {
    const models = controller.getVLModels();
    const result = await select({
      message: "选择 VL 模型:",
      options: models.map((m) => ({
        value: m.id,
        label: m.name,
        hint: m.description,
      })),
    });

    if (!isCancel(result)) {
      controller.setVL(result as string);
      console.log(`\x1b[32m已选择: ${result}\x1b[0m`);
    }
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

  try {
    const outline = await controller.generateOutline(topic, description);

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

    const result = await controller.generateDocument(topic, description || "", outline);

    // 5. 显示结果
    console.log("\n\x1b[32m✅ 文档生成完成!\x1b[0m");
    console.log(`📁 文件: ${result.filePath}`);
    console.log(`📊 章节数: ${result.sectionCount}`);
    console.log(`📝 字数: ${result.wordCount}`);

    // 等待用户确认后再返回
    await waitForConfirm("按 Enter 返回主界面");

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31m生成失败: ${errorMsg}\x1b[0m`);

    // 如果是网络相关错误，给出更详细的提示
    if (errorMsg.includes('aborted') || errorMsg.includes('fetch') || errorMsg.includes('network')) {
      console.log("\x1b[90m提示: 网络连接可能不稳定，请检查后重试。\x1b[0m");
    }

    await waitForConfirm("按 Enter 返回");
  }
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

  console.log("\n\x1b[33m正在分析模板风格并生成文档...\x1b[0m");

  try {
    const result = await controller.generateDocumentFromTemplate(
      path.join(templatesDir, template as string),
      topic,
      description
    );

    console.log("\n\x1b[32m✅ 文档生成完成!\x1b[0m");
    console.log(`📁 文件: ${result.filePath}`);
    console.log("\x1b[90m文档已保存\x1b[0m");
    await waitForConfirm("按 Enter 返回主界面");

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`\x1b[31m生成失败: ${errorMsg}\x1b[0m`);

    // 如果是网络相关错误，给出更详细的提示
    if (errorMsg.includes('aborted') || errorMsg.includes('fetch') || errorMsg.includes('network')) {
      console.log("\x1b[90m提示: 网络连接可能不稳定，请检查后重试。\x1b[0m");
    }

    await waitForConfirm("按 Enter 返回");
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
          messages.push({ role: "system", content: helpText } as Message);
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

        // /帮助 或 /help
        if (cmd === "/帮助" || cmd === "/help" || cmd === "/?") {
          const helpText = `可用命令:
  /0-1 或 /new    从零开始生成文档
  /模板 或 /template  基于模板生成
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
          const vlModels = controller.getVLModels();
          let content = "可用模型:\n\nLLM 模型:\n";
          for (const m of llmModels) {
            content += `  ${m.name} - ${m.description}\n`;
          }
          content += "\nVL 模型:\n";
          for (const m of vlModels) {
            content += `  ${m.name} - ${m.description}\n`;
          }
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
