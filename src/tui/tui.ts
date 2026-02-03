/**
 * DocForge TUI - 完整抄自 OpenCode 架构
 * 支持实时斜杠命令，正确处理 stdin 状态
 */

import { select, cancel, isCancel, text } from "@clack/prompts";
import { Message } from "./types";
import * as readline from "readline";
// 使用全局 process，无需导入

// 全局退出标志
let isExiting = false;

// 全局信号处理 - 确保 Ctrl+C 总是能退出
process.on("SIGINT", () => {
  if (isExiting) return;
  isExiting = true;

  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.removeAllListeners("keypress");
    process.stdin.pause();
  } catch (e) {
    // 忽略错误
  }

  console.log("\n\x1b[90m再见！\x1b[0m");
  process.exit(0);
});

// 主题配置 (抄自 OpenCode)
const THEME = {
  dark: {
    primary: "#58a6ff",
    text: "#c9d1d9",
    textMuted: "#8b949e",
    success: "#3fb950",
    error: "#f85149",
    warning: "#d29922",
  },
};

// 命令定义 (抄自 OpenCode)
export interface CommandOption {
  id: string;
  title: string;
  description?: string;
  category?: string;
}

const COMMANDS: CommandOption[] = [
  { id: "new", title: "从零开始撰写", description: "从零开始生成文档", category: "文档" },
  { id: "template", title: "基于模板生成", description: "基于模板生成文档", category: "文档" },
  { id: "mcp", title: "MCP 工具", description: "查看 MCP 工具状态", category: "工具" },
  { id: "skills", title: "Skills 管理", description: "查看和管理 Skills", category: "工具" },
  { id: "model", title: "模型配置", description: "管理模型配置", category: "设置" },
  { id: "settings", title: "项目设置", description: "查看项目设置", category: "设置" },
  { id: "help", title: "帮助", description: "查看帮助信息", category: "系统" },
  { id: "exit", title: "退出", description: "退出程序", category: "系统" },
];

/**
 * 优雅退出 - 确保 Ctrl+C 能正常工作
 */
function gracefulExit(): void {
  if (isExiting) return;
  isExiting = true;

  // 强制关闭 raw mode
  try {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
  } catch (e) {
    // 忽略错误
  }

  // 移除所有监听器
  try {
    process.stdin.removeAllListeners("keypress");
  } catch (e) {
    // 忽略错误
  }

  // 确保 stdin 不是暂停状态
  try {
    if (!process.stdin.isPaused()) {
      process.stdin.pause();
    }
  } catch (e) {
    // 忽略错误
  }

  // 发送换行以打断可能的输出
  process.stdout.write("\n");

  console.log("\x1b[90m再见！\x1b[0m");

  // 强制退出 - 使用 setTimeout 确保在所有 I/O 完成后再退出
  setTimeout(() => {
    process.exit(0);
  }, 50);
}

/**
 * 重置 stdin 状态 (关键修复)
 * 确保 stdin 从 @clack/prompts 的干扰中完全恢复
 */
function resetStdin(): void {
  try {
    // 1. 关闭 raw mode
    if (process.stdin.isTTY && process.stdin.isRaw) {
      process.stdin.setRawMode(false);
    }

    // 2. 移除所有监听器
    process.stdin.removeAllListeners("keypress");

    // 3. 重新绑定 keypress 事件（关键！）
    readline.emitKeypressEvents(process.stdin);

    // 4. 确保 stdin 暂停（等待读取）
    if (!process.stdin.isPaused()) {
      process.stdin.pause();
    }

    // 5. 再次尝试关闭 raw mode（双重保障）
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false);
      } catch {
        // 忽略错误
      }
    }
  } catch (error) {
    // 忽略所有错误
  }
}

/**
 * 等待终端稳定
 */
function waitForStabilize(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 100));
}

/**
 * 显示头部 (抄自 OpenCode)
 */
function showHeader(): void {
  console.log(`\x1b[36m
    ██╗██╗     ██╗ ██████╗ ███████╗
    ██║██║     ██║██╔═══██╗██╔════╝
    ██║██║     ██║██║   ██║█████╗
    ██║██║     ██║██║   ██║██╔══╝
    ██║███████╗██║╚██████╔╝███████╗
    ╚═╝╚══════╝╚═╝ ╚═════╝ ╚══════╝\x1b[0m`);
  console.log(`\x1b[1;36m欢迎使用 DocForge v0.1\x1b[0m`);
  console.log(`\x1b[90m输入 / 显示命令菜单\x1b[0m`);
  console.log("");
}

/**
 * 显示消息历史 (抄自 OpenCode)
 */
function showMessages(messages: Message[]): void {
  for (const msg of messages) {
    const color = msg.role === "user" ? THEME.dark.success :
                  msg.role === "assistant" ? THEME.dark.primary :
                  THEME.dark.textMuted;
    const label = msg.role === "user" ? "你" :
                  msg.role === "assistant" ? "AI" : "系统";
    console.log(`\x1b[1;${color}m[${label}]\x1b[0m`);
    console.log(msg.content);
    console.log("");
  }
}

/**
 * 实时输入处理 (抄自 OpenCode)
 */
class RealtimeInput {
  private input = "";
  private commandMode = false;
  private keyHandler: ((char: string, key: any) => void) | null = null;
  private resolvePromise: ((value: string | null) => void) | null = null;

  async start(): Promise<string | null> {
    // 重置 stdin 状态
    resetStdin();
    await waitForStabilize();

    this.input = "";
    this.commandMode = false;

    return new Promise((resolve) => {
      this.resolvePromise = resolve;

      // 确保 stdin 已经 resume
      if (process.stdin.isTTY && process.stdin.isPaused()) {
        process.stdin.resume();
      }

      // 设置 raw mode
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
      }

      // 再次确认 raw mode 已设置
      if (process.stdin.isTTY && !process.stdin.isRaw) {
        process.stdin.setRawMode(true);
      }

      this.keyHandler = (char: string, key: any) => {
        // Ctrl+C 退出 - 立即退出 (兼容多种终端)
        if (key.ctrl && (char === "c" || key.name === "c")) {
          this.cleanup();
          gracefulExit();
          return;
        }

        // Escape - 取消并返回
        if (key.name === "escape") {
          this.cleanup();
          resolve(null);
          return;
        }

        // Enter - 提交
        if (key.name === "enter") {
          this.cleanup();
          resolve(this.input);
          return;
        }

        // Backspace - 删除
        if (key.name === "backspace") {
          if (this.input.length > 0) {
            this.input = this.input.slice(0, -1);
            if (!this.input.includes("/")) {
              this.commandMode = false;
            }
            this.render();
          }
          return;
        }

        // 普通字符
        if (char && char.length === 1) {
          this.input += char;

          // 检测斜杠
          if (this.input === "/") {
            this.cleanup();
            resolve("/");
            return;
          }

          this.render();
        }
      };

      process.stdin.on("keypress", this.keyHandler);
      this.render();
    });
  }

  private cleanup(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    if (this.keyHandler) {
      process.stdin.removeListener("keypress", this.keyHandler);
    }
    // 确保 stdin 不是 paused
    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
  }

  private render(): void {
    process.stdout.write("\r\x1b[K");
    const prompt = this.commandMode ? "\x1b[36m命令> \x1b[0m" : "\x1b[36m> \x1b[0m";
    const display = this.commandMode ? this.input.replace("/", "") : this.input;
    process.stdout.write(prompt + display);
  }
}

/**
 * 显示命令选择菜单 (抄自 OpenCode)
 */
async function showCommandMenu(): Promise<string | null> {
  const cmd = await select({
    message: "选择命令:",
    options: COMMANDS.map((c) => ({
      value: c.id,
      label: c.title,
      hint: c.description,
    })),
  });

  // 在 select 完成后重置 stdin (关键!)
  resetStdin();

  if (isCancel(cmd)) {
    cancel("已取消");
    return null;
  }

  return cmd as string;
}

/**
 * 等待用户确认
 */
async function waitForConfirm(message: string = "按 Enter 继续"): Promise<void> {
  resetStdin();
  await waitForStabilize();
  await text({ message });
}

/**
 * 启动 TUI 主循环 (抄自 OpenCode 架构)
 */
export async function startTui(options: {
  onCommand?: (cmd: string) => Promise<string | void>;
  onSubmit?: (text: string) => Promise<void>;
} = {}): Promise<void> {
  const messages: Message[] = [];

  while (!isExiting) {
    try {
      // 1. 重置 stdin
      resetStdin();
      await waitForStabilize(); // 等待终端稳定

      // 2. 清屏
      console.clear();

      // 3. 显示头部
      showHeader();

      // 4. 显示消息
      if (messages.length > 0) {
        showMessages(messages);
      }

      // 5. 创建新的输入实例
      const input = new RealtimeInput();
      const result = await input.start();

      if (result === null) {
        // 用户取消
        break;
      }

      if (!result) {
        continue;
      }

      // 6. 命令模式
      if (result === "/") {
        // 确保 stdin 在调用 select 之前是完全干净的
        resetStdin();
        await waitForStabilize();

        const cmd = await showCommandMenu();

        // select 完成后重置 stdin
        resetStdin();
        await waitForStabilize();

        if (cmd !== null) {
          await options.onCommand?.(cmd);
        }
        continue;
      }

      // 7. 普通消息
      messages.push({ role: "user", content: result });
      await options.onSubmit?.(result);
    } catch (error) {
      // 发生错误，重置并继续
      resetStdin();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // 确保最终重置 stdin
  resetStdin();
  console.log("\x1b[90m再见！\x1b[0m");
}

export { COMMANDS, waitForConfirm };
