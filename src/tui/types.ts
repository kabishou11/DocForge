/**
 * TUI 类型定义
 */

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface CommandOption {
  id: string;
  title: string;
  description?: string;
  category?: string;
}
