#!/usr/bin/env node

/**
 * DocForge CLI - 文档生成命令行工具
 *
 * 使用方法：
 *   docforge              # 启动 TUI 交互界面
 *   docforge init         # 初始化项目配置
 *   docforge style        # 查看/管理风格模板
 *   docforge generate     # 生成文档 (交互式)
 *   docforge models       # 管理模型配置
 *   docforge preview      # 预览文档结构
 *   docforge sync         # 同步到 GitHub
 *   docforge status       # 查看项目状态
 *   docforge config       # 查看/修改配置
 */

import * as readline from 'readline';
import { Command } from 'commander';
import { DocumentWorkflow } from './workflow/document';
import { LLMClient, createLLMClient } from './llm/client';
import { ModelScopeService } from './services/modelscope';
import { ConfigManager } from './config';
import { startTui } from './tui';
import { extractStylesFromDocx, generateDocxWithPython, getDefaultStyleRules, type PythonStyleRules } from './services/python-docx';
import { buildTimestampedDocumentStem } from './utils/path-safety';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

/**
 * 初始化 CLI
 */
export async function main(): Promise<void> {
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')
  );

  program
    .name('docforge')
    .description('LLM 驱动的文档生成 CLI')
    .version(packageJson.version)
    .configureOutput({
      writeOut: (str: string) => process.stdout.write(str),
      writeErr: (str: string) => process.stderr.write(str)
    });

  // tui 命令
  program
    .command('tui')
    .description('启动 TUI 交互界面')
    .action(async () => {
      await startTui();
    });

  // init 命令
  program
    .command('init')
    .description('初始化项目配置')
    .action(async () => {
      await cmdInit();
    });

  // style 命令
  program
    .command('style [action]')
    .description('风格模板管理 (list|show|export)')
    .action(async (action) => {
      await cmdStyle(action);
    });

  // generate 命令
  program
    .command('generate')
    .description('生成文档')
    .option('-t, --topic <topic>', '文档主题')
    .option('-d, --description <desc>', '文档描述')
    .option('-o, --output <path>', '输出文件路径')
    .option('--debug', '调试模式')
    .action(async (options) => {
      await cmdGenerate(options);
    });

  // convert 命令：把 Obsidian/Markdown 直接转成 DOCX
  program
    .command('convert <input>')
    .description('将 Obsidian/Markdown 文档转换为可交付 DOCX')
    .option('-o, --output <path>', '输出 DOCX 路径')
    .option('--template <docx>', '参考 DOCX 模板样式')
    .option('--style <json>', '使用已提取的样式 JSON')
    .option('--asset-root <dir>', '图片/附件根目录，默认使用 Markdown 所在目录')
    .action(async (input, options) => {
      await cmdConvert(input, options);
    });

  // preview 命令
  program
    .command('preview')
    .description('预览文档大纲')
    .option('-t, --topic <topic>', '文档主题')
    .option('-d, --description <desc>', '文档描述')
    .action(async (options) => {
      await cmdPreview(options);
    });

  // sync 命令（暂未实现）
  program
    .command('sync')
    .description('同步到 GitHub（暂未实现）')
    .action(async () => {
      console.error('❌ sync 命令暂未实现，请使用 git 命令手动同步。');
      process.exit(1);
    });

  // status 命令
  program
    .command('status')
    .description('查看项目状态')
    .action(async () => {
      await cmdStatus();
    });

  // config 命令
  program
    .command('config')
    .description('查看/修改配置')
    .option('--get <key>', '获取配置项')
    .option('--set <key> <value>', '设置配置项')
    .action(async (options) => {
      await cmdConfig(options);
    });

  // models 命令
  program
    .command('models')
    .description('管理模型配置')
    .option('--list', '列出所有可用模型')
    .option('--set <apiKey>', '设置 ModelScope API Key')
    .option('--llm <modelId>', '设置 LLM 模型')
    .option('--vl <modelId>', '设置 VL 模型')
    .option('--test', '测试模型连接')
    .action(async (options) => {
      await cmdModels(options);
    });

  await program.parseAsync(process.argv);
}

/**
 * init 命令实现
 */
async function cmdInit(): Promise<void> {
  console.log('🚀 初始化 DocForge 项目...\n');

  const config = {
    version: '1.0.0',
    app: 'docforge',
    llm: {
      baseUrl: process.env.LLM_BASE_URL || 'https://api-inference.modelscope.cn/v1',
      model: 'deepseek-ai/DeepSeek-V3.2'
    },
    github: {
      owner: '',
      repo: 'xyjk_-Proposal',
      branch: 'main'
    },
    style: {
      version: 'v0.1',
      defaultTemplate: 'default'
    },
    output: {
      directory: './output'
    }
  };

  // 创建默认配置
  const configPath = './.docforgerc';
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ 配置文件已创建: ${configPath}`);

  // 创建输出目录
  const outputDir = './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`✅ 输出目录已创建: ${outputDir}`);
  }

  // 复制默认风格模板
  const styleTemplatePath = './style.json';
  if (!fs.existsSync(styleTemplatePath)) {
    fs.writeFileSync(
      styleTemplatePath,
      JSON.stringify(getDefaultStyle(), null, 2)
    );
    console.log(`✅ 风格模板已创建: ${styleTemplatePath}`);
  }

  console.log('\n📋 下一步操作:');
  console.log('   1. 编辑 .docforgerc 配置 LLM API Key');
  console.log('   2. 运行 docforge generate -t "主题" -d "描述" 生成文档');
}

/**
 * style 命令实现
 */
async function cmdStyle(action?: string): Promise<void> {
  console.log('🎨 风格模板管理\n');

  const stylePath = './style.json';

  if (!fs.existsSync(stylePath)) {
    console.log('❌ 未找到 style.json，请先运行 docforge init');
    return;
  }

  const style = JSON.parse(fs.readFileSync(stylePath, 'utf-8'));

  switch (action) {
    case 'show':
    case undefined:
      console.log('当前风格配置:');
      console.log(JSON.stringify(style, null, 2));
      break;
    case 'export':
      const exportPath = './style.export.json';
      fs.writeFileSync(exportPath, JSON.stringify(style, null, 2));
      console.log(`✅ 已导出到: ${exportPath}`);
      break;
    default:
      console.log(`未知操作: ${action}`);
      console.log('可用操作: show, export');
  }
}

/**
 * generate 命令实现
 */
async function cmdGenerate(options: {
  topic?: string;
  description?: string;
  output?: string;
  debug?: boolean;
}): Promise<void> {
  console.log('📄 文档生成\n');

  // 获取输入
  let topic = options.topic;
  let description = options.description;

  if (!topic) {
    topic = await promptInput('请输入文档主题: ');
  }
  if (!description) {
    description = await promptInput('请输入文档描述: ');
  }

  // 创建 LLM 客户端
  const llmClient = createLLMClient();

  // 创建工作流
  const workflow = new DocumentWorkflow({
    llmClient,
    outputPath: options.output,
    debug: options.debug
  });

  await workflow.initialize();

  // 执行生成
  try {
    const result = await workflow.generate({ topic, description });
    console.log('\n✅ 文档生成完成!');
    console.log(`📁 输出文件: ${result.documentPath}`);
    console.log(`📋 章节数: ${result.outline.sections.length}`);
  } catch (error) {
    console.error('❌ 生成失败:', error);
    process.exit(1);
  }
}

/**
 * convert 命令实现：Obsidian/Markdown -> DOCX
 */
async function cmdConvert(input: string, options: {
  output?: string;
  template?: string;
  style?: string;
  assetRoot?: string;
}): Promise<void> {
  const inputPath = path.resolve(input);
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ 文件不存在: ${inputPath}`);
    process.exit(1);
  }

  const ext = path.extname(inputPath).toLowerCase();
  if (!['.md', '.markdown', '.txt'].includes(ext)) {
    console.error('❌ convert 目前支持 .md/.markdown/.txt 输入');
    process.exit(1);
  }

  let styleRules: PythonStyleRules = getDefaultStyleRules();
  if (options.template) {
    const templatePath = path.resolve(options.template);
    if (!fs.existsSync(templatePath)) {
      console.error(`❌ 模板不存在: ${templatePath}`);
      process.exit(1);
    }
    styleRules = await extractStylesFromDocx(templatePath);
  } else if (options.style) {
    const stylePath = path.resolve(options.style);
    if (!fs.existsSync(stylePath)) {
      console.error(`❌ 样式文件不存在: ${stylePath}`);
      process.exit(1);
    }
    styleRules = JSON.parse(fs.readFileSync(stylePath, 'utf-8')) as PythonStyleRules;
  }

  const outputPath = options.output
    ? path.resolve(options.output)
    : path.resolve(
        './output',
        `${buildTimestampedDocumentStem(path.basename(inputPath, ext), 'converted')}.docx`
      );

  const markdown = fs.readFileSync(inputPath, 'utf-8');
  const assetRoot = options.assetRoot
    ? path.resolve(options.assetRoot)
    : path.dirname(inputPath);

  try {
    await generateDocxWithPython({
      markdown,
      outputPath,
      styleRules,
      assetRoot,
    });
  } catch (error) {
    console.error('❌ DOCX 转换失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log('✅ DOCX 转换完成');
  console.log(`📄 输入: ${inputPath}`);
  console.log(`📁 输出: ${outputPath}`);
}

/**
 * preview 命令实现
 */
async function cmdPreview(options: {
  topic?: string;
  description?: string;
}): Promise<void> {
  console.log('👁️ 文档预览\n');

  let topic = options.topic;
  if (!topic) {
    topic = await promptInput('请输入文档主题: ');
  }
  const description = options.description || '无';

  const llmClient = createLLMClient();

  let outline;
  try {
    outline = await llmClient.generateOutline(topic, description);
  } catch (error) {
    console.error('❌ 大纲生成失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log('文档大纲:');
  console.log(`主题: ${topic}`);
  console.log(`描述: ${description}`);
  console.log(`预估字数: ${outline.wordCount}`);
  console.log('\n章节列表:');

  for (let i = 0; i < outline.sections.length; i++) {
    const section = outline.sections[i];
    const indent = '  '.repeat(section.level - 1);
    console.log(`${indent}${i + 1}. ${section.title} (${section.summary})`);
  }
}

/**
 * sync 命令实现
 */
async function cmdSync(options: {
  branch?: string;
  message?: string;
}): Promise<void> {
  console.log('🔄 同步到 GitHub\n');
  console.log('⚠️  GitHub 同步功能待实现');
  console.log('   目标仓库: https://github.com/kabishou11/xyjk_-Proposal');
}

/**
 * status 命令实现
 */
async function cmdStatus(): Promise<void> {
  console.log('📊 项目状态\n');

  const configPath = './.docforgerc';
  const stylePath = './style.json';
  const outputDir = './output';

  console.log('配置文件:', fs.existsSync(configPath) ? '✅' : '❌');
  console.log('风格模板:', fs.existsSync(stylePath) ? '✅' : '❌');
  console.log('输出目录:', fs.existsSync(outputDir) ? '✅' : '❌');

  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir);
    console.log(`输出文件数: ${files.length}`);
  }
}

/**
 * config 命令实现
 */
async function cmdConfig(options: {
  get?: string;
  set?: string;
}): Promise<void> {
  console.log('⚙️  配置管理\n');

  const configPath = './.docforgerc';

  if (!fs.existsSync(configPath)) {
    console.log('❌ 未找到配置文件，请先运行 docforge init');
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (options.get) {
    const value = getNestedValue(config, options.get);
    console.log(`${options.get}: ${JSON.stringify(value)}`);
  } else if (options.set) {
    const parts = options.set.split(' ');
    if (parts.length < 2) {
      console.log('❌ 请提供完整的键值对');
      return;
    }
    const key = parts[0];
    const value = parts.slice(1).join(' ');
    setNestedValue(config, key, value);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ 已更新配置: ${key} = ${value}`);
  } else {
    console.log('当前配置:');
    console.log(JSON.stringify(config, null, 2));
  }
}

/**
 * 获取默认风格配置
 */
function getDefaultStyle(): Record<string, unknown> {
  return {
    version: 'v0.1',
    page: {
      size: { width: 210, height: 297 },
      margins: { top: 25.4, right: 31.7, bottom: 25.4, left: 31.7 },
      orientation: 'portrait'
    },
    font: {
      eastAsia: '宋体',
      ascii: 'Calibri',
      size: { heading: 15.75, body: 10.5, caption: 9 }
    },
    paragraph: {
      spacing: { line: 360, before: 0, after: 0 },
      indent: { firstLine: 2 }
    },
    headingStyles: [
      { level: 1, styleId: 'Heading1', name: '一级标题' },
      { level: 2, styleId: 'Heading2', name: '二级标题' },
      { level: 3, styleId: 'Heading3', name: '三级标题' }
    ]
  };
}

/**
 * 提示输入
 */
async function promptInput(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/**
 * 获取嵌套值
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((o: unknown, k) => (o as Record<string, unknown>)?.[k], obj);
}

/**
 * 设置嵌套值
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!current[parts[i]]) {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * models 命令实现
 */
async function cmdModels(options: {
  list?: boolean;
  set?: string;
  llm?: string;
  vl?: string;
  test?: boolean;
}): Promise<void> {
  console.log('🤖 模型配置管理\n');

  const configManager = new ConfigManager();
  const apiKey = options.set || configManager.getApiKey();

  if (!apiKey) {
    console.log('未配置 ModelScope API Key');
    console.log('\n使用以下方式配置：');
    console.log('  1. 环境变量: set MODELSCOPE_API_KEY=your-key');
    console.log('  2. 命令行: docforge --set <api-key>');
    console.log('  3. TUI 中输入: /模型');
    return;
  }

  // 如果提供了 --set 参数，保存 API Key
  if (options.set) {
    configManager.setApiKey(options.set);
    console.log('API Key 已保存');
  }

  const modelService = new ModelScopeService(configManager);

  // 测试连接
  if (options.test || options.list) {
    console.log('正在连接 ModelScope...');

    try {
      const result = await modelService.testConnection();
      if (!result.success) {
        console.log(`连接失败: ${result.message}`);
        return;
      }
      console.log('连接成功!\n');
    } catch (error) {
      console.log(`连接失败: ${error}`);
      return;
    }
  }

  // 列出模型
  if (options.list) {
    console.log('📋 可用模型列表:\n');

    try {
      const models = await modelService.listModels();

      // 按类型分组
      const llmModels = models.filter(m => m.type === 'llm');
      const vlModels = models.filter(m => m.type === 'vl');

      console.log('【LLM 模型】');
      for (const model of llmModels.slice(0, 20)) {
        const desc = model.description ? ` - ${model.description}` : '';
        console.log(`  • ${model.id}${desc}`);
      }
      if (llmModels.length > 20) {
        console.log(`  ... 共 ${llmModels.length} 个`);
      }

      console.log('\n【VL 模型 (视觉语言)】');
      for (const model of vlModels) {
        const desc = model.description ? ` - ${model.description}` : '';
        console.log(`  • ${model.id}${desc}`);
      }
    } catch (error) {
      console.log(`❌ 获取模型列表失败: ${error}`);
    }
    return;
  }

  // 测试连接
  if (options.test) {
    console.log('✅ ModelScope 连接测试通过');
    console.log('\n使用 --list 查看可用模型');
    console.log('使用 --llm <model-id> 设置 LLM 模型');
    console.log('使用 --vl <model-id> 设置 VL 模型');
  }

  // 设置 LLM
  if (options.llm) {
    console.log(`✅ 已设置 LLM 模型: ${options.llm}`);
  }

  // 设置 VL
  if (options.vl) {
    console.log(`✅ 已设置 VL 模型: ${options.vl}`);
  }

  if (!options.list && !options.test && !options.llm && !options.vl) {
    console.log('模型配置选项：');
    console.log('  --list       列出所有可用模型');
    console.log('  --set <key>  设置 ModelScope API Key');
    console.log('  --llm <id>   设置 LLM 模型');
    console.log('  --vl <id>    设置 VL 模型');
    console.log('  --test       测试连接');
  }
}

// 导出供测试
export {
  cmdInit,
  cmdStyle,
  cmdGenerate,
  cmdConvert,
  cmdPreview,
  cmdSync,
  cmdStatus,
  cmdConfig,
  cmdModels
};

// 运行主函数
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
