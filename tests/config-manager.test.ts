import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConfigManager } from '../src/config';

const tempDirs: string[] = [];

function createTempConfigManager(): ConfigManager {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docforge-config-'));
  tempDirs.push(dir);
  return new ConfigManager(dir);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('ConfigManager', () => {
  it('preserves saved API keys when partial updates omit or blank apiKey', () => {
    const manager = createTempConfigManager();

    manager.updateModelConfig({
      format: 'openai',
      baseUrl: 'https://old.example/v1',
      apiKey: 'sk-existing-key',
      model: 'old-model',
    });

    manager.updateModelConfig({
      baseUrl: 'https://new.example/v1',
      apiKey: '',
      model: undefined,
    });

    expect(manager.getModelConfig()).toMatchObject({
      format: 'openai',
      baseUrl: 'https://new.example/v1',
      apiKey: 'sk-existing-key',
      model: 'old-model',
    });
  });

  it('trims meaningful model configuration fields before saving', () => {
    const manager = createTempConfigManager();

    manager.updateModelConfig({
      baseUrl: '  https://api.example/v1  ',
      apiKey: '  sk-new-key  ',
      model: '  model-name  ',
    });

    expect(manager.getModelConfig()).toMatchObject({
      baseUrl: 'https://api.example/v1',
      apiKey: 'sk-new-key',
      model: 'model-name',
    });
  });
});
