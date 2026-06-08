/**
 * DocForge Web API Server
 * Express wrapper around TuiController with SSE streaming
 */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { TuiController } from '../tui/controller';
import {
  extractStylesFromDocx,
  generateDocxWithPython,
  getDefaultStyleRules,
} from '../services/python-docx';
import {
  buildTimestampedDocumentStem,
  ensureAllowedExtension,
  resolveExistingFileInRoots,
  resolveInsideDirectory,
  sanitizeFileName,
  safeTopicFileStem,
} from '../utils/path-safety';

// Dynamic import for mammoth (ES module)
let mammoth: any;
try {
  mammoth = require('mammoth');
} catch (e) {
  console.warn('mammoth not available, DOCX preview will be limited');
}

const app = express();
const PORT = parseInt(process.env.PORT || '3456', 10);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (output directory)
app.use('/output', express.static(path.resolve('./output')));

// Initialize controller
const controller = new TuiController();

// Ensure directories exist
const templatesDir = path.resolve('./templates');
const outputDir = path.resolve('./output');
const TEMPLATE_EXTENSIONS = ['.docx', '.md', '.txt'];
const OUTPUT_EXTENSIONS = ['.docx', '.md'];
const DOWNLOAD_EXTENSIONS = [...TEMPLATE_EXTENSIONS, ...OUTPUT_EXTENSIONS];
if (!fs.existsSync(templatesDir)) fs.mkdirSync(templatesDir, { recursive: true });
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function sendFileError(res: express.Response, error: unknown, defaultStatus = 500): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = message.includes('非法') || message.includes('不支持') ? 400 : defaultStatus;
  res.status(status).json({ success: false, message });
}

function extractTitleFromMarkdown(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m);
  if (heading?.[1]) {
    return heading[1].trim();
  }
  const firstContentLine = markdown
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && !line.startsWith('---') && !line.startsWith('tags:'));
  return firstContentLine || fallback;
}

function wordCountLike(markdown: string): number {
  const chinese = (markdown.match(/[\u4e00-\u9fff]/g) || []).length;
  const english = (markdown.match(/[a-zA-Z]+/g) || []).length;
  return chinese + english;
}

// Multer upload config
const upload = multer({ dest: 'templates/' });

// ========== Health ==========
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// ========== Model Config (新简化 API) ==========

// 获取当前模型配置
app.get('/api/model/config', (_req, res) => {
  res.json(controller.getModelConfig());
});

// 更新模型配置（支持部分更新）
app.post('/api/model/config', (req, res) => {
  const { format, baseUrl, apiKey, model } = req.body;
  try {
    controller.updateModelConfig({ format, baseUrl, apiKey, model });
    res.json({ success: true, config: controller.getModelConfig() });
  } catch (error) {
    res.status(500).json({ success: false, message: String(error) });
  }
});

// 获取所有预设列表
app.get('/api/model/presets', (_req, res) => {
  res.json(controller.getPresets());
});

// 使用预设
app.post('/api/model/preset', (req, res) => {
  const { preset } = req.body;
  if (!preset) {
    res.status(400).json({ success: false, message: '缺少 preset 参数' });
    return;
  }
  try {
    controller.applyPreset(preset);
    res.json({ success: true, config: controller.getModelConfig() });
  } catch (error) {
    res.status(500).json({ success: false, message: String(error) });
  }
});

// 测试连接
app.post('/api/model/test', async (_req, res) => {
  const result = await controller.testConnection();
  res.json(result);
});

// ========== 兼容旧接口 ==========

app.post('/api/config/apikey', (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey || apiKey.length < 10) {
    res.status(400).json({ success: false, message: 'API Key 无效' });
    return;
  }
  const result = controller.setApiKey(apiKey);
  res.json({ success: result });
});

app.get('/api/config', (_req, res) => {
  res.json(controller.getModelConfig());
});

// ========== Models ==========
app.get('/api/models', async (_req, res) => {
  try {
    await new Promise(r => setTimeout(r, 500)); // Give controller time to load
    const models = controller.getAllModels();
    res.json(models);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/models/llm', (req, res) => {
  const { modelId } = req.body;
  const result = controller.setLLM(modelId);
  res.json({ success: result });
});

app.post('/api/models/ocr', (req, res) => {
  const { modelId } = req.body;
  const result = controller.setOCR(modelId);
  res.json({ success: result });
});

app.get('/api/models/test', async (_req, res) => {
  const result = await controller.testConnection();
  res.json(result);
});

// ========== Templates ==========
app.get('/api/templates', (_req, res) => {
  try {
    const files = fs.readdirSync(templatesDir)
      .filter(f => ['.docx', '.md', '.txt'].includes(path.extname(f).toLowerCase()))
      .map(f => ({
        name: f,
        path: path.join(templatesDir, f),
        size: fs.statSync(path.join(templatesDir, f)).size,
        ext: path.extname(f).toLowerCase(),
      }));
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.post('/api/upload/template', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ success: false, message: '未上传文件' });
    return;
  }
  try {
    const originalName = sanitizeFileName(req.file.originalname, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
      fallbackBaseName: 'template',
    });
    const targetPath = resolveInsideDirectory(templatesDir, originalName, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
      fallbackBaseName: 'template',
    });
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(req.file.path);
      res.status(409).json({ success: false, message: '模板文件已存在' });
      return;
    }
    fs.renameSync(req.file.path, targetPath);
    res.json({ success: true, file: { name: originalName, path: targetPath } });
  } catch (error) {
    try {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    } catch {
      // 忽略上传临时文件清理失败
    }
    sendFileError(res, error, 400);
  }
});

// ========== History ==========
app.get('/api/history', (_req, res) => {
  try {
    const files = fs.readdirSync(outputDir)
      .filter(f => f.endsWith('.docx') || f.endsWith('.md'))
      .map(f => {
        const stat = fs.statSync(path.join(outputDir, f));
        return {
          name: f,
          path: path.join(outputDir, f),
          size: stat.size,
          created: stat.birthtime,
          type: f.endsWith('.docx') ? 'docx' : 'md',
        };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime());
    res.json(files);
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

// Track active generations for cancellation
let activeGeneration: { aborted: boolean; abortController: AbortController } | null = null;

// ========== Generate (SSE Streaming) ==========
app.post('/api/generate/stream', (req, res) => {
  const { type, topic, description, templatePath, wordCount, enableSearch } = req.body;

  // Abort any existing generation
  if (activeGeneration) {
    activeGeneration.aborted = true;
    activeGeneration.abortController.abort();
  }
  const genToken = { aborted: false, abortController: new AbortController() };
  activeGeneration = genToken;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send keepalive every 15s to prevent proxy timeout
  const keepalive = setInterval(() => {
    if (!genToken.aborted) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  const sendEvent = (data: any) => {
    if (!genToken.aborted) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const progressHandler = (progress: any) => {
    sendEvent({ type: 'progress', data: progress });
  };

  const runGeneration = async () => {
    try {
      sendEvent({ type: 'start', data: { message: '开始生成...' } });

      if (genToken.aborted) return;

      if (type === 'from-scratch') {
        // Step 1: Generate outline
        sendEvent({ type: 'step', data: { step: 'outline', status: 'started', message: '生成文档大纲...' } });
        const outline = await controller.generateOutline(topic, description, genToken.abortController.signal);
        if (genToken.aborted) return;
        sendEvent({ type: 'step', data: { step: 'outline', status: 'completed', message: `${outline.sections.length} 个章节`, sections: outline.sections } });

        // Step 2: Generate document
        sendEvent({ type: 'step', data: { step: 'generate', status: 'started', message: '生成文档内容...' } });
        const result = await controller.generateDocument(topic, description, outline, genToken.abortController.signal);
        if (genToken.aborted) return;
        sendEvent({ type: 'step', data: { step: 'generate', status: 'completed', message: `${result.wordCount} 字` } });

        sendEvent({ type: 'complete', data: result });
      } else if (type === 'from-template') {
        if (!templatePath) {
          sendEvent({ type: 'error', data: { message: '缺少模板文件名' } });
          return;
        }
        const fullTemplatePath = resolveInsideDirectory(templatesDir, templatePath || '', {
          allowedExtensions: TEMPLATE_EXTENSIONS,
        });

        const result = await controller.generateDocumentFromTemplate(
          fullTemplatePath,
          topic,
          description,
          {
            onProgress: progressHandler,
            wordCount: wordCount || 3000,
            enableSearch: enableSearch !== false,
            signal: genToken.abortController.signal,
          }
        );

        if (!genToken.aborted) {
          sendEvent({ type: 'complete', data: result });
        }
      } else {
        sendEvent({ type: 'error', data: { message: '未知的生成类型' } });
      }
    } catch (error) {
      if (!genToken.aborted) {
        sendEvent({ type: 'error', data: { message: error instanceof Error ? error.message : String(error) } });
      }
    } finally {
      clearInterval(keepalive);
      if (activeGeneration === genToken) {
        activeGeneration = null;
      }
      res.end();
    }
  };

  runGeneration().catch((err: Error) => {
    console.error('Unhandled generation error:', err.message);
    if (!res.writableEnded) {
      res.end();
    }
  });

  // Handle client disconnect
  res.on('close', () => {
    if (!res.writableEnded) {
      genToken.aborted = true;
      genToken.abortController.abort();
    }
    clearInterval(keepalive);
  });
});

// ========== Conversational Modify (SSE Streaming) ==========
app.post('/api/generate/modify', (req, res) => {
  const { topic, templatePath, currentContent, modifyRequest, wordCount, enableSearch } = req.body;

  if (!modifyRequest || !currentContent) {
    res.status(400).json({ error: '缺少修改要求或当前内容' });
    return;
  }

  // Abort any existing generation
  if (activeGeneration) {
    activeGeneration.aborted = true;
    activeGeneration.abortController.abort();
  }
  const genToken = { aborted: false, abortController: new AbortController() };
  activeGeneration = genToken;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const keepalive = setInterval(() => {
    if (!genToken.aborted) {
      res.write(': keepalive\n\n');
    }
  }, 15000);

  const sendEvent = (data: any) => {
    if (!genToken.aborted) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

  const progressHandler = (progress: any) => {
    sendEvent({ type: 'progress', data: progress });
  };

  const runModification = async () => {
    try {
      sendEvent({ type: 'start', data: { message: '正在根据修改要求重新生成...' } });

      if (templatePath) {
        const fullTemplatePath = resolveInsideDirectory(templatesDir, templatePath, {
          allowedExtensions: TEMPLATE_EXTENSIONS,
        });

        // 使用模板模式重新生成，但带上修改要求
        const result = await controller.generateDocumentFromTemplate(
          fullTemplatePath,
          topic || '修改文档',
          `${modifyRequest}\n\n当前文档内容参考：\n${currentContent.slice(0, 2000)}`,
          {
            onProgress: progressHandler,
            wordCount: wordCount || 3000,
            enableSearch: enableSearch !== false,
            signal: genToken.abortController.signal,
          }
        );

        if (!genToken.aborted) {
          sendEvent({ type: 'complete', data: result });
        }
      } else {
        sendEvent({ type: 'error', data: { message: '修改模式需要选择模板' } });
      }
    } catch (error) {
      if (!genToken.aborted) {
        sendEvent({ type: 'error', data: { message: error instanceof Error ? error.message : String(error) } });
      }
    } finally {
      clearInterval(keepalive);
      if (activeGeneration === genToken) {
        activeGeneration = null;
      }
      res.end();
    }
  };

  runModification().catch((err: Error) => {
    console.error('Unhandled modification error:', err.message);
    if (!res.writableEnded) {
      res.end();
    }
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      genToken.aborted = true;
      genToken.abortController.abort();
    }
    clearInterval(keepalive);
  });
});

// Cancel active generation
app.post('/api/generate/cancel', (_req, res) => {
  if (activeGeneration) {
    activeGeneration.aborted = true;
    activeGeneration.abortController.abort();
    activeGeneration = null;
    res.json({ success: true, message: '已取消生成' });
  } else {
    res.json({ success: false, message: '没有正在进行的生成任务' });
  }
});

// ========== Convert Markdown/Obsidian to DOCX ==========
app.post('/api/convert/markdown', async (req, res) => {
  try {
    const {
      fileName,
      markdown,
      templateName,
    }: {
      fileName?: string;
      markdown?: string;
      templateName?: string;
      assetRoot?: string;
    } = req.body || {};

    if (!markdown || typeof markdown !== 'string' || !markdown.trim()) {
      res.status(400).json({ success: false, message: 'Markdown 内容不能为空' });
      return;
    }

    const sourceName = sanitizeFileName(fileName || 'obsidian.md', {
      allowedExtensions: ['.md', '.markdown', '.txt', '.docx'],
      fallbackBaseName: 'obsidian',
      maxLength: 80,
    });
    const sourceStem = safeTopicFileStem(path.basename(sourceName, path.extname(sourceName)) || extractTitleFromMarkdown(markdown, 'obsidian'));
    const outputStem = buildTimestampedDocumentStem(sourceStem, 'converted');
    const mdPath = path.join(outputDir, `${outputStem}.md`);
    const docxPath = path.join(outputDir, `${outputStem}.docx`);

    let styleRules = getDefaultStyleRules();
    if (templateName) {
      const templatePath = resolveInsideDirectory(templatesDir, templateName, {
        allowedExtensions: TEMPLATE_EXTENSIONS,
      });
      if (!fs.existsSync(templatePath)) {
        res.status(400).json({ success: false, message: `模板 "${templateName}" 不存在` });
        return;
      }
      if (path.extname(templatePath).toLowerCase() === '.docx') {
        styleRules = await extractStylesFromDocx(templatePath);
      }
    }

    fs.writeFileSync(mdPath, markdown, 'utf-8');
    await generateDocxWithPython({
      markdown,
      outputPath: docxPath,
      styleRules,
      assetRoot: templatesDir,
    });

    res.json({
      success: true,
      filePath: mdPath,
      docxPath,
      wordCount: wordCountLike(markdown),
    });
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

// ========== Template Operations ==========
app.get('/api/templates/:name/preview', async (req, res) => {
  try {
    const templateName = req.params.name;
    const filePath = resolveInsideDirectory(templatesDir, templateName, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
    });
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '模板不存在' });
      return;
    }
    const ext = path.extname(templateName).toLowerCase();
    if (ext === '.md' || ext === '.txt') {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content, type: 'md' });
    } else if (ext === '.docx') {
      // Use mammoth to extract text from DOCX
      if (!mammoth) {
        const stat = fs.statSync(filePath);
        res.json({ content: `DOCX 文件 (${(stat.size / 1024).toFixed(1)} KB) - mammoth 未安装`, type: 'text' });
        return;
      }
      try {
        const buffer = fs.readFileSync(filePath);
        console.log('Extracting DOCX text, buffer size:', buffer.length);
        const result = await mammoth.extractRawText({ buffer });
        console.log('DOCX extraction result length:', result.value?.length);
        const content = result.value || '（DOCX 文件内容为空）';
        res.json({ content, type: 'md' });
      } catch (docxError) {
        console.error('DOCX template preview error:', docxError);
        res.json({ content: `DOCX 预览失败: ${docxError}`, type: 'unknown' });
      }
    } else {
      res.json({ content: '不支持预览此文件类型', type: 'unknown' });
    }
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

app.delete('/api/templates/:name', (req, res) => {
  try {
    const templateName = req.params.name;
    const filePath = resolveInsideDirectory(templatesDir, templateName, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
    });
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: '模板不存在' });
      return;
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

app.post('/api/templates/:name/rename', (req, res) => {
  try {
    const oldName = req.params.name;
    const { newName } = req.body;
    if (!newName || !newName.trim()) {
      res.status(400).json({ success: false, message: '新文件名不能为空' });
      return;
    }
    const safeNewName = sanitizeFileName(newName.trim(), {
      allowedExtensions: TEMPLATE_EXTENSIONS,
      fallbackBaseName: 'template',
    });
    const oldPath = resolveInsideDirectory(templatesDir, oldName, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
    });
    const newPath = resolveInsideDirectory(templatesDir, safeNewName, {
      allowedExtensions: TEMPLATE_EXTENSIONS,
      fallbackBaseName: 'template',
    });
    if (!fs.existsSync(oldPath)) {
      res.status(404).json({ success: false, message: '模板不存在' });
      return;
    }
    if (fs.existsSync(newPath)) {
      res.status(409).json({ success: false, message: '目标文件名已存在' });
      return;
    }
    fs.renameSync(oldPath, newPath);
    res.json({ success: true, name: safeNewName });
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

// ========== History Operations ==========
app.get('/api/history/:name/preview', async (req, res) => {
  try {
    const fileName = req.params.name;
    const filePath = resolveInsideDirectory(outputDir, fileName, {
      allowedExtensions: OUTPUT_EXTENSIONS,
    });
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '文件不存在' });
      return;
    }
    const ext = path.extname(fileName).toLowerCase();
    if (ext === '.md') {
      const content = fs.readFileSync(filePath, 'utf-8');
      res.json({ content, type: 'md' });
    } else if (ext === '.docx') {
      // Use mammoth to extract text from DOCX
      if (!mammoth) {
        const stat = fs.statSync(filePath);
        res.json({ content: `DOCX 文件 (${(stat.size / 1024).toFixed(1)} KB) - mammoth 未安装`, type: 'text' });
        return;
      }
      try {
        const buffer = fs.readFileSync(filePath);
        console.log('Extracting DOCX history text, buffer size:', buffer.length);
        const result = await mammoth.extractRawText({ buffer });
        console.log('DOCX history extraction result length:', result.value?.length);
        const content = result.value || '（DOCX 文件内容为空）';
        res.json({ content, type: 'md' });
      } catch (docxError) {
        console.error('DOCX history preview error:', docxError);
        res.json({ content: `DOCX 预览失败: ${docxError}`, type: 'unknown' });
      }
    } else {
      res.json({ content: '不支持预览此文件类型', type: 'unknown' });
    }
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

app.delete('/api/history/:name', (req, res) => {
  try {
    const fileName = req.params.name;
    const filePath = resolveInsideDirectory(outputDir, fileName, {
      allowedExtensions: OUTPUT_EXTENSIONS,
    });
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, message: '文件不存在' });
      return;
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (error) {
    sendFileError(res, error, 400);
  }
});

// ========== Download ==========
app.get('/api/download', (req, res) => {
  const rawPath = req.query.path as string;
  if (!rawPath) {
    res.status(400).json({ error: '缺少文件路径' });
    return;
  }
  let resolved: string;
  try {
    // 安全：只允许在 output/templates 目录内下载已知扩展名的文件
    resolved = resolveExistingFileInRoots(rawPath, [outputDir, templatesDir]);
    ensureAllowedExtension(resolved, DOWNLOAD_EXTENSIONS);
  } catch {
    res.status(403).json({ error: '非法文件路径' });
    return;
  }
  if (!fs.existsSync(resolved)) {
    res.status(404).json({ error: '文件不存在' });
    return;
  }
  res.download(resolved);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  DocForge Web API 运行在 http://localhost:${PORT}\n`);
  console.log(`  API 文档:`);
  console.log(`    GET  /api/health          健康检查`);
  console.log(`    GET  /api/model/config    获取模型配置`);
  console.log(`    POST /api/model/config    更新模型配置`);
  console.log(`    GET  /api/model/presets    获取预设列表`);
  console.log(`    POST /api/model/preset    使用预设`);
  console.log(`    POST /api/model/test      测试连接`);
  console.log(`    GET  /api/templates       模板列表`);
  console.log(`    GET  /api/history         生成历史`);
  console.log(`    POST /api/generate/stream SSE 流式生成`);
  console.log(`    POST /api/generate/cancel 取消生成`);
  console.log(`    POST /api/convert/markdown Markdown 转 DOCX`);
  console.log('');
});
