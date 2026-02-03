/**
 * ModelScope API 服务 - 支持模型配置
 */

import { ModelInfo, ModelProvider } from '../types';
import { ConfigManager } from '../config';

const MODELSCOPE_BASE_URL = 'https://api-inference.modelscope.cn/v1';

export interface ModelScopeConfig {
  apiKey: string;
}

export interface ModelScopeModelsResponse {
  object: string;
  data: Array<{
    id: string;
    object: string;
    created: number;
    owned_by: string;
  }>;
}

// 预定义的常用模型列表
const POPULAR_MODELS: ModelInfo[] = [
  // LLM Models
  {
    id: 'deepseek-ai/DeepSeek-V3.2',
    name: 'DeepSeek-V3.2',
    type: 'llm',
    description: '强大的文本生成模型，适合长文档撰写',
    contextLength: 128000,
    provider: 'modelscope'
  },
  {
    id: 'deepseek-ai/DeepSeek-V2.5',
    name: 'DeepSeek-V2.5',
    type: 'llm',
    description: '高效文本生成模型',
    contextLength: 128000,
    provider: 'modelscope'
  },
  {
    id: 'Qwen/Qwen3-235B-A22B',
    name: 'Qwen3-235B',
    type: 'llm',
    description: '大规模语言模型',
    contextLength: 128000,
    provider: 'modelscope'
  },
  {
    id: 'Qwen/Qwen2.5-72B-Instruct',
    name: 'Qwen2.5-72B',
    type: 'llm',
    description: '72B 参数指令微调模型',
    contextLength: 128000,
    provider: 'modelscope'
  },
  // VL Models
  {
    id: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
    name: 'Qwen3-VL-235B',
    type: 'vl',
    description: '视觉语言模型，支持图文理解',
    contextLength: 128000,
    provider: 'modelscope'
  },
  {
    id: 'Qwen/Qwen2.5-VL-7B-Instruct',
    name: 'Qwen2.5-VL-7B',
    type: 'vl',
    description: '轻量级视觉语言模型',
    contextLength: 128000,
    provider: 'modelscope'
  },
  {
    id: 'Qwen/Qwen2-VL-7B-Instruct',
    name: 'Qwen2-VL-7B',
    type: 'vl',
    description: '视觉语言模型',
    contextLength: 128000,
    provider: 'modelscope'
  },
  // OCR Models
  {
    id: 'local:PaddleOCR-VL-1.5',
    name: 'PaddleOCR-VL-1.5',
    type: 'ocr',
    description: '本地 OCR 模型，支持图文识别',
    contextLength: 4096,
    provider: 'local',
    localPath: './models/PaddleOCR-VL-1.5'
  }
];

/**
 * ModelScope API 服务类
 */
export class ModelScopeService {
  private apiKey: string;
  private baseUrl: string;
  private configManager: ConfigManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
    this.apiKey = this.configManager.getApiKey();
    this.baseUrl = this.configManager.getBaseUrl();
  }

  /**
   * 获取所有可用模型
   */
  async listModels(): Promise<ModelInfo[]> {
    // 优先返回预定义模型列表（避免频繁 API 调用）
    // 如果需要真实列表，可以调用 API
    return POPULAR_MODELS;
  }

  /**
   * 获取 LLM 模型列表
   */
  async listLLMModels(): Promise<ModelInfo[]> {
    const models = await this.listModels();
    return models.filter(m => m.type === 'llm');
  }

  /**
   * 获取 VL 模型列表
   */
  async listVLModels(): Promise<ModelInfo[]> {
    const models = await this.listModels();
    return models.filter(m => m.type === 'vl');
  }

  /**
   * 获取 OCR 模型列表
   */
  async listOCRModels(): Promise<ModelInfo[]> {
    const models = await this.listModels();
    return models.filter(m => m.type === 'ocr');
  }

  /**
   * 获取当前选中的 LLM 模型
   */
  getSelectedLLM(): { id: string; name: string; contextLength: number } {
    return this.configManager.getLLM();
  }

  /**
   * 获取当前选中的 VL 模型
   */
  getSelectedVL(): { id: string; name: string } {
    return this.configManager.getVL();
  }

  /**
   * 设置 LLM 模型
   */
  setLLM(modelId: string, modelName?: string): void {
    const models = POPULAR_MODELS.find(m => m.id === modelId && m.type === 'llm');
    if (models) {
      this.configManager.setLLM(modelId, models.name, models.contextLength);
    } else {
      this.configManager.setLLM(modelId, modelName || modelId.split('/').pop() || modelId);
    }
  }

  /**
   * 设置 VL 模型
   */
  setVL(modelId: string, modelName?: string): void {
    const models = POPULAR_MODELS.find(m => m.id === modelId && m.type === 'vl');
    if (models) {
      this.configManager.setVL(modelId, models.name);
    } else {
      this.configManager.setVL(modelId, modelName || modelId.split('/').pop() || modelId);
    }
  }

  /**
   * 测试 API 连接
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: '未配置 API Key' };
    }

    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        return { success: true, message: 'API 连接成功' };
      } else {
        return { success: false, message: `API 连接失败: ${response.status}` };
      }
    } catch (error) {
      return { success: false, message: `连接错误: ${error}` };
    }
  }

  /**
   * 测试 LLM 模型
   */
  async testLLM(): Promise<{ success: boolean; message: string; responseTime: number }> {
    const startTime = Date.now();

    if (!this.apiKey) {
      return { success: false, message: '未配置 API Key', responseTime: 0 };
    }

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.getSelectedLLM().id,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 10
        })
      });

      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return { success: true, message: '模型响应正常', responseTime };
      } else {
        return { success: false, message: `模型测试失败: ${response.status}`, responseTime };
      }
    } catch (error) {
      return { success: false, message: `测试错误: ${error}`, responseTime: Date.now() - startTime };
    }
  }

  /**
   * 获取配置信息
   */
  getConfigInfo(): {
    provider: string;
    baseUrl: string;
    hasApiKey: boolean;
    llm: { id: string; name: string };
    vl: { id: string; name: string };
  } {
    return {
      provider: this.configManager.getProvider(),
      baseUrl: this.configManager.getBaseUrl(),
      hasApiKey: !!this.apiKey,
      llm: this.getSelectedLLM(),
      vl: this.getSelectedVL()
    };
  }

  /**
   * 检查是否已配置完成
   */
  isConfigured(): boolean {
    return this.configManager.isConfigured();
  }
}

export default ModelScopeService;
