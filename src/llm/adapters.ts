/**
 * LLM Adapters - 统一模型适配层
 *
 * 只支持两种 API 格式：
 * - OpenAI 兼容（OpenAI, DeepSeek, Moonshot, 智谱, ModelScope 等）
 * - Anthropic（Claude 系列）
 */

import { EventEmitter } from 'events';
import type { ApiFormat } from '../config';
import type { ChatMessage, ChatOptions, ChatResponse, StreamChunk } from './client';
import { extractText } from './client';

// ==================== 接口定义 ====================

export interface AdapterConfig {
  format: ApiFormat;
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface ModelAdapter {
  /** 发送聊天请求（非流式） */
  chat(messages: ChatMessage[], options: Partial<ChatOptions>): Promise<ChatResponse>;
  /** 流式聊天 */
  chatStream(messages: ChatMessage[], options: Partial<ChatOptions>): AsyncGenerator<StreamChunk>;
  /** 测试连接 */
  testConnection(): Promise<{ success: boolean; message: string }>;
  /** 获取 API 格式类型 */
  getFormat(): ApiFormat;
}

function createAbortContext(timeoutMs: number, externalSignal?: AbortSignal): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromExternal = () => controller.abort();

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeout);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    },
  };
}

// ==================== 通用类型 ====================

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
}

interface AnthropicStreamEvent {
  type: string;
  index?: number;
  delta?: {
    type: string;
    text?: string;
    thinking?: string;
    stop_reason?: string;
  };
  content_block?: {
    type: string;
    text?: string;
    thinking?: string;
  };
  message?: {
    id: string;
    content: AnthropicContentBlock[];
    usage?: { input_tokens: number; output_tokens: number };
  };
}

// ==================== OpenAI 兼容适配器 ====================

export class OpenAIAdapter extends EventEmitter implements ModelAdapter {
  protected baseUrl: string;
  protected apiKey: string;
  protected defaultModel: string;
  protected timeout: number;

  constructor(config: AdapterConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.model;
    this.timeout = config.timeout || 180000;
  }

  getFormat(): ApiFormat {
    return 'openai';
  }

  async chat(messages: ChatMessage[], options: Partial<ChatOptions> = {}): Promise<ChatResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      messages: this.transformMessages(messages),
      stream: false,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    };

    if (options.enableThinking !== undefined) {
      body.extra_body = { enable_thinking: options.enableThinking };
    }

    const response = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    }, options.signal);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error ${response.status}: ${error}`);
    }

    return response.json() as Promise<ChatResponse>;
  }

  async *chatStream(messages: ChatMessage[], options: Partial<ChatOptions> = {}): AsyncGenerator<StreamChunk> {
    const endpoint = `${this.baseUrl}/chat/completions`;

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      messages: this.transformMessages(messages),
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
    };

    if (options.enableThinking !== undefined) {
      body.extra_body = { enable_thinking: options.enableThinking };
    }

    const abortContext = createAbortContext(this.timeout, options.signal);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: abortContext.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error ${response.status}: ${error}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
              yield JSON.parse(data) as StreamChunk;
            } catch {
              // ignore parse error
            }
          }
        }
      }
    } finally {
      abortContext.cleanup();
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hi, respond with "ok" only.' }],
        { maxTokens: 10 }
      );
      return {
        success: true,
        message: `连接成功 (${response.model || this.defaultModel})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  protected transformMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages;
  }

  protected async fetchWithTimeout(url: string, options: RequestInit, signal?: AbortSignal): Promise<Response> {
    const abortContext = createAbortContext(this.timeout, signal);
    try {
      return await fetch(url, { ...options, signal: abortContext.signal });
    } finally {
      abortContext.cleanup();
    }
  }
}

// ==================== Anthropic 适配器 ====================

export class AnthropicAdapter extends EventEmitter implements ModelAdapter {
  private baseUrl: string;
  private apiKey: string;
  private defaultModel: string;
  private timeout: number;
  private apiVersion: string;

  constructor(config: AdapterConfig) {
    super();
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.defaultModel = config.model;
    this.timeout = config.timeout || 180000;
    this.apiVersion = '2023-06-01';
  }

  getFormat(): ApiFormat {
    return 'anthropic';
  }

  private transformMessages(messages: ChatMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
  } {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        system = typeof msg.content === 'string' ? msg.content : extractText(msg.content);
      } else {
        anthropicMessages.push({
          role: msg.role as 'user' | 'assistant',
          content: typeof msg.content === 'string' ? msg.content : extractText(msg.content),
        });
      }
    }

    return { system, messages: anthropicMessages };
  }

  async chat(messages: ChatMessage[], options: Partial<ChatOptions> = {}): Promise<ChatResponse> {
    const endpoint = `${this.baseUrl}/v1/messages`;
    const { system, messages: anthropicMessages } = this.transformMessages(messages);

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: anthropicMessages,
      stream: false,
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await this.fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': this.apiVersion,
      },
      body: JSON.stringify(body),
    }, options.signal);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API Error ${response.status}: ${error}`);
    }

    const data = await response.json() as any;

    return {
      id: data.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: data.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.content?.[0]?.text || '',
        },
        finish_reason: data.stop_reason || 'stop',
      }],
      usage: data.usage ? {
        prompt_tokens: data.usage.input_tokens || 0,
        completion_tokens: data.usage.output_tokens || 0,
        total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }

  async *chatStream(messages: ChatMessage[], options: Partial<ChatOptions> = {}): AsyncGenerator<StreamChunk> {
    const endpoint = `${this.baseUrl}/v1/messages`;
    const { system, messages: anthropicMessages } = this.transformMessages(messages);

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      max_tokens: options.maxTokens || 4096,
      messages: anthropicMessages,
      stream: true,
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const abortContext = createAbortContext(this.timeout, options.signal);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
        },
        body: JSON.stringify(body),
        signal: abortContext.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API Error ${response.status}: ${error}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data) as AnthropicStreamEvent;

              if (event.type === 'content_block_delta' && event.delta) {
                yield {
                  id: 'anthropic-stream',
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: this.defaultModel,
                  choices: [{
                    index: event.index || 0,
                    delta: {
                      role: 'assistant',
                      content: event.delta.text || '',
                      thinking: event.delta.thinking || undefined,
                    },
                    finish_reason: undefined,
                  }],
                };
              } else if (event.type === 'message_delta' && event.delta?.stop_reason) {
                yield {
                  id: 'anthropic-stream',
                  object: 'chat.completion.chunk',
                  created: Math.floor(Date.now() / 1000),
                  model: this.defaultModel,
                  choices: [{
                    index: 0,
                    delta: {},
                    finish_reason: event.delta.stop_reason,
                  }],
                };
              }
            } catch {
              // ignore parse error
            }
          }
        }
      }
    } finally {
      abortContext.cleanup();
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.chat(
        [{ role: 'user', content: 'Hi, respond with "ok" only.' }],
        { maxTokens: 10 }
      );
      return {
        success: true,
        message: `连接成功 (${response.model || this.defaultModel})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async fetchWithTimeout(url: string, options: RequestInit, signal?: AbortSignal): Promise<Response> {
    const abortContext = createAbortContext(this.timeout, signal);
    try {
      return await fetch(url, { ...options, signal: abortContext.signal });
    } finally {
      abortContext.cleanup();
    }
  }
}

// ==================== 适配器工厂 ====================

/**
 * 根据 API 格式自动创建适配器
 */
export function createAdapter(config: AdapterConfig): ModelAdapter {
  switch (config.format) {
    case 'anthropic':
      return new AnthropicAdapter(config);
    case 'openai':
    default:
      return new OpenAIAdapter(config);
  }
}

export default createAdapter;
