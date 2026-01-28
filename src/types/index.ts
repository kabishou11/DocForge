/**
 * DocForge TUI - 核心类型定义
 */

import { EventEmitter } from 'events';
import { ChatMessage, ContentBlock } from '../llm/client';

// ==================== 配置类型 ====================

// Re-export for convenience
export { ChatMessage, ContentBlock };

export interface ModelProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey?: string;
  models: ModelInfo[];
  selectedLLM?: string;
  selectedVL?: string;
  isDefault: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  type: 'llm' | 'vl';
  description?: string;
  contextLength?: number;
  provider?: string;
}

export interface ProjectConfig {
  version: string;
  templateDir: string;
  outputDir: string;
  providers: ModelProvider[];
  activeProvider: string;
}

export interface TemplateInfo {
  id: string;
  name: string;
  filePath: string;
  lastModified: Date;
  description?: string;
  style?: DocumentStyle;
}

export interface DocumentStyle {
  pageSize: { width: number; height: number };
  margins: { top: number; right: number; bottom: number; left: number };
  fonts: {
    eastAsia: string;
    ascii: string;
    heading: number;
    body: number;
  };
  headingStyles: HeadingStyle[];
  // ... 更多样式
}

export interface HeadingStyle {
  level: number;
  styleId: string;
  name: string;
  fontSize: number;
}

// ==================== 工作流类型 ====================

export interface GenerationRequest {
  type: '0-1' | 'template';
  topic: string;
  description: string;
  templateId?: string;
  styleOverrides?: Partial<DocumentStyle>;
}

export interface GenerationResult {
  success: boolean;
  outputPath?: string;
  outline?: SectionInfo[];
  error?: string;
}

export interface SectionInfo {
  id: string;
  title: string;
  level: number;
  summary: string;
  content?: string;
}

// ==================== TUI 状态类型 ====================

export type AppMode = 'welcome' | 'chat' | 'template' | 'template-select' | 'model-config' | 'settings';

export interface TuiState {
  mode: AppMode;
  messages: ChatMessage[];
  currentProvider: ModelProvider | null;
  templates: TemplateInfo[];
  selectedTemplate: TemplateInfo | null;
  isProcessing: boolean;
}

// ==================== 事件类型 ====================

export interface AppEvents {
  'mode:change': (mode: AppMode) => void;
  'message:add': (message: ChatMessage) => void;
  'message:clear': () => void;
  'template:select': (template: TemplateInfo) => void;
  'provider:change': (provider: ModelProvider) => void;
  'processing:start': () => void;
  'processing:end': () => void;
  'error': (error: Error) => void;
}

// ==================== 工具类型 ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  data?: unknown;
}
