/**
 * 配置文件管理 - Claude Code 风格
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface DocForgeConfig {
  // API 配置
  api: {
    provider: 'modelscope' | 'openai' | 'anthropic';
    apiKey: string;
    baseUrl: string;
  };

  // 模型配置
  models: {
    llm: {
      id: string;
      name: string;
      contextLength: number;
    };
    vl: {
      id: string;
      name: string;
    };
    ocr: {
      id: string;
      name: string;
    };
  };

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

const DEFAULT_CONFIG: DocForgeConfig = {
  api: {
    provider: 'modelscope',
    apiKey: '',
    baseUrl: 'https://api-inference.modelscope.cn/v1'
  },
  models: {
    llm: {
      id: 'deepseek-ai/DeepSeek-V3.2',
      name: 'DeepSeek-V3.2',
      contextLength: 128000
    },
    vl: {
      id: 'Qwen/Qwen3-VL-235B-A22B-Instruct',
      name: 'Qwen3-VL-235B'
    },
    ocr: {
      id: 'local:PaddleOCR-VL-1.5',
      name: 'PaddleOCR-VL-1.5'
    }
  },
  directories: {
    templates: './templates',
    output: './output',
    cache: './.cache'
  },
  ui: {
    theme: 'dark',
    showSuggestions: true,
    autoSave: true
  },
  version: '0.1.0'
};

const CONFIG_FILE_NAME = 'docforge.config.json';

/**
 * 配置管理器
 */
export class ConfigManager {
  private configPath: string;
  private config: DocForgeConfig;

  constructor(configDir?: string) {
    // 默认配置目录
    const defaultDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
    const dir = configDir || path.join(defaultDir, 'docforge');

    this.configPath = path.join(dir, CONFIG_FILE_NAME);
    this.config = this.loadConfig();
  }

  /**
   * 加载配置
   */
  private loadConfig(): DocForgeConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(data) as DocForgeConfig;
        // 合并默认配置，确保新字段存在
        return { ...DEFAULT_CONFIG, ...loadedConfig };
      }
    } catch (error) {
      // 加载失败，使用默认配置
    }
    return { ...DEFAULT_CONFIG };
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

  /**
   * 获取完整配置
   */
  get(): DocForgeConfig {
    return this.config;
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): void {
    this.config.api.apiKey = apiKey;
    this.save();
  }

  /**
   * 获取 API Key
   */
  getApiKey(): string {
    return this.config.api.apiKey || process.env.MODELSCOPE_API_KEY || '';
  }

  /**
   * 设置 LLM 模型
   */
  setLLM(modelId: string, modelName: string, contextLength: number = 128000): void {
    this.config.models.llm = { id: modelId, name: modelName, contextLength };
    this.save();
  }

  /**
   * 获取 LLM 模型
   */
  getLLM(): { id: string; name: string; contextLength: number } {
    return this.config.models.llm;
  }

  /**
   * 设置 VL 模型
   */
  setVL(modelId: string, modelName: string): void {
    this.config.models.vl = { id: modelId, name: modelName };
    this.save();
  }

  /**
   * 获取 VL 模型
   */
  getVL(): { id: string; name: string } {
    return this.config.models.vl;
  }

  /**
   * 设置 OCR 模型
   */
  setOCR(modelId: string, modelName: string): void {
    this.config.models.ocr = { id: modelId, name: modelName };
    this.save();
  }

  /**
   * 获取 OCR 模型
   */
  getOCR(): { id: string; name: string } {
    return this.config.models.ocr;
  }

  /**
   * 设置提供商
   */
  setProvider(provider: 'modelscope' | 'openai' | 'anthropic'): void {
    this.config.api.provider = provider;

    // 更新对应的 baseUrl
    switch (provider) {
      case 'modelscope':
        this.config.api.baseUrl = 'https://api-inference.modelscope.cn/v1';
        break;
      case 'openai':
        this.config.api.baseUrl = 'https://api.openai.com/v1';
        break;
      case 'anthropic':
        this.config.api.baseUrl = 'https://api.anthropic.com/v1';
        break;
    }
    this.save();
  }

  /**
   * 获取提供商
   */
  getProvider(): 'modelscope' | 'openai' | 'anthropic' {
    return this.config.api.provider;
  }

  /**
   * 获取基础 URL
   */
  getBaseUrl(): string {
    return this.config.api.baseUrl;
  }

  /**
   * 设置模板目录
   */
  setTemplatesDir(dir: string): void {
    this.config.directories.templates = dir;
    this.save();
  }

  /**
   * 获取模板目录
   */
  getTemplatesDir(): string {
    return this.config.directories.templates;
  }

  /**
   * 设置输出目录
   */
  setOutputDir(dir: string): void {
    this.config.directories.output = dir;
    this.save();
  }

  /**
   * 获取输出目录
   */
  getOutputDir(): string {
    return this.config.directories.output;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!this.getApiKey();
  }

  /**
   * 重置为默认配置
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
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
