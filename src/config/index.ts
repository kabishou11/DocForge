/**
 * DocForge 配置管理 - 简化版
 *
 * 核心理念：统一模型 API 网关
 * - 只支持两种 API 格式：OpenAI 兼容 和 Anthropic
 * - 用户配置：Base URL + API Key + 模型名
 * - 预设 = 快捷配置（不是独立 Provider）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ==================== 核心类型 ====================

export type ApiFormat = 'openai' | 'anthropic';

export interface ModelConfig {
  format: ApiFormat;       // API 格式
  baseUrl: string;         // API 端点
  apiKey: string;          // API Key
  model: string;           // 模型名称
}

export interface DocForgeConfig {
  // 模型配置（核心）
  model: ModelConfig;

  // 目录配置
  directories: {
    templates: string;
    output: string;
    cache: string;
  };

  // 界面配置
  ui: {
    theme: 'dark' | 'light';
    showSuggestions: boolean;
    autoSave: boolean;
  };

  // 版本
  version: string;
}

// ==================== 预设配置 ====================

export const PRESETS: Record<string, Omit<ModelConfig, 'apiKey'>> = {
  'modelscope': {
    format: 'openai',
    baseUrl: 'https://api-inference.modelscope.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3.2',
  },
  'deepseek': {
    format: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  'openai': {
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  },
  'anthropic': {
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
  },
  'moonshot': {
    format: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-128k',
  },
  'zhipu': {
    format: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
  },
};

export type PresetName = keyof typeof PRESETS;

// ==================== 默认配置 ====================

const DEFAULT_MODEL_CONFIG: ModelConfig = {
  format: 'openai',
  baseUrl: 'https://api-inference.modelscope.cn/v1',
  apiKey: '',
  model: 'deepseek-ai/DeepSeek-V3.2',
};

const DEFAULT_CONFIG: DocForgeConfig = {
  model: { ...DEFAULT_MODEL_CONFIG },
  directories: {
    templates: './templates',
    output: './output',
    cache: './.cache',
  },
  ui: {
    theme: 'dark',
    showSuggestions: true,
    autoSave: true,
  },
  version: '0.2.0',
};

const CONFIG_FILE_NAME = 'docforge.config.json';

// ==================== 配置管理器 ====================

export class ConfigManager {
  private configPath: string;
  private config: DocForgeConfig;

  constructor(configDir?: string) {
    const defaultDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const dir = configDir || path.join(defaultDir, 'docforge');
    this.configPath = path.join(dir, CONFIG_FILE_NAME);
    this.config = this.loadConfig();
  }

  /**
   * 加载配置（含旧版迁移）
   */
  private loadConfig(): DocForgeConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loaded = JSON.parse(data);

        // 检测旧版配置格式并迁移
        if (loaded.activeProvider || loaded.providers) {
          return this.migrateOldConfig(loaded);
        }

        // 新版格式，深度合并
        return {
          ...DEFAULT_CONFIG,
          ...loaded,
          model: {
            ...DEFAULT_MODEL_CONFIG,
            ...(loaded.model || {}),
          },
          directories: {
            ...DEFAULT_CONFIG.directories,
            ...(loaded.directories || {}),
          },
          ui: {
            ...DEFAULT_CONFIG.ui,
            ...(loaded.ui || {}),
          },
        };
      }
    } catch {
      // 加载失败，使用默认配置
    }
    return { ...DEFAULT_CONFIG, model: { ...DEFAULT_MODEL_CONFIG } };
  }

  /**
   * 迁移旧版配置到新版格式
   */
  private migrateOldConfig(old: any): DocForgeConfig {
    const activeProvider = old.activeProvider || 'modelscope';
    const providerConfig = old.providers?.[activeProvider] || {};
    const legacyApi = old.api || {};

    // 根据旧 provider 名推断 format
    let format: ApiFormat = 'openai';
    if (activeProvider === 'anthropic') {
      format = 'anthropic';
    }

    const migrated: DocForgeConfig = {
      model: {
        format: providerConfig.format || format,
        baseUrl: providerConfig.baseUrl || legacyApi.baseUrl || DEFAULT_MODEL_CONFIG.baseUrl,
        apiKey: providerConfig.apiKey || legacyApi.apiKey || '',
        model: providerConfig.model || old.models?.llm?.id || DEFAULT_MODEL_CONFIG.model,
      },
      directories: {
        ...DEFAULT_CONFIG.directories,
        ...(old.directories || {}),
      },
      ui: {
        ...DEFAULT_CONFIG.ui,
        ...(old.ui || {}),
      },
      version: '0.2.0',
    };

    // 保存迁移后的配置
    this.config = migrated;
    this.save();

    return migrated;
  }

  /**
   * 保存配置
   */
  save(): void {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
  }

  // ==================== 模型配置 API ====================

  /**
   * 获取完整模型配置
   */
  getModelConfig(): ModelConfig {
    return { ...this.config.model };
  }

  /**
   * 更新模型配置（部分更新）
   */
  updateModelConfig(updates: Partial<ModelConfig>): void {
    this.config.model = {
      ...this.config.model,
      ...updates,
    };
    this.save();
  }

  /**
   * 应用预设配置（保留用户已有的 apiKey）
   */
  applyPreset(presetName: PresetName): void {
    const preset = PRESETS[presetName];
    if (!preset) return;

    // 保留已有的 apiKey，除非预设有新的
    this.config.model = {
      ...preset,
      apiKey: this.config.model.apiKey,
    };
    this.save();
  }

  /**
   * 获取 API Key
   */
  getApiKey(): string {
    return this.config.model.apiKey || process.env.MODELSCOPE_API_KEY || '';
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.config.model.apiKey = apiKey;
    this.save();
  }

  /**
   * 获取 Base URL
   */
  getBaseUrl(): string {
    return this.config.model.baseUrl;
  }

  /**
   * 获取模型名称
   */
  getModel(): string {
    return this.config.model.model;
  }

  /**
   * 获取 API 格式
   */
  getFormat(): ApiFormat {
    return this.config.model.format;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  // ==================== 兼容旧接口 ====================

  /**
   * 获取完整配置（兼容旧接口）
   */
  get(): DocForgeConfig {
    return this.config;
  }

  /**
   * 获取 LLM 模型信息（兼容旧接口）
   */
  getLLM(): { id: string; name: string; contextLength: number } {
    return {
      id: this.config.model.model,
      name: this.config.model.model.split('/').pop() || this.config.model.model,
      contextLength: 128000,
    };
  }

  /**
   * 设置 LLM 模型（兼容旧接口）
   */
  setLLM(modelId: string, modelName?: string, contextLength?: number): void {
    this.config.model.model = modelId;
    this.save();
  }

  /**
   * 获取 OCR 模型信息（兼容旧接口）
   */
  getOCR(): { id: string; name: string } {
    return { id: 'local:PaddleOCR-VL-1.5', name: 'PaddleOCR-VL-1.5' };
  }

  /**
   * 设置 OCR 模型（兼容旧接口）
   */
  setOCR(modelId: string, modelName: string): void {
    // OCR 模型配置暂时保留
    this.save();
  }

  // ==================== 目录配置 ====================

  getTemplatesDir(): string {
    return this.config.directories.templates;
  }

  setTemplatesDir(dir: string): void {
    this.config.directories.templates = dir;
    this.save();
  }

  getOutputDir(): string {
    return this.config.directories.output;
  }

  setOutputDir(dir: string): void {
    this.config.directories.output = dir;
    this.save();
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG, model: { ...DEFAULT_MODEL_CONFIG } };
    this.save();
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }
}

// 导出单例
export const configManager = new ConfigManager();

export default ConfigManager;
