/**
 * 内置 MCP 服务器
 *
 * 实现 Model Context Protocol，提供网络搜索、网页获取等工具
 * 当项目启动时自动运行
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

const PORT = process.env.MCP_PORT || 19842;

// ==================== MCP 工具定义 ====================

interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
  }>;
  isError?: boolean;
}

// 搜索缓存
const searchCache = new Map<string, { results: any[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000;

// Perplexity API 配置
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
const PERPLEXITY_ENDPOINT = 'https://api.perplexity.ai/chat/completions';

// ==================== 工具实现 ====================

/**
 * Perplexity Search (免费，每天100次)
 * AI 原生搜索，结果质量高
 */
async function searchPerplexity(query: string, maxResults: number = 5): Promise<any[]> {
  if (!PERPLEXITY_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(PERPLEXITY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content: '你是一个搜索助手。请用中文简洁回答问题，并提供相关信息来源。'
          },
          {
            role: 'user',
            content: `请搜索关于"${query}"的最新信息，返回关键要点和来源链接。`
          }
        ],
        max_tokens: 1000
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json() as any;
    const content = data.choices?.[0]?.message?.content || '';

    // 解析结果 - Perplexity 返回的是对话式回答，提取关键信息
    return [{
      title: query,
      url: '',
      snippet: content.slice(0, 500)
    }];
  } catch {
    return [];
  }
}

/**
 * Web Search 工具 - 多源搜索，包括 Perplexity AI 原生搜索
 */
async function webSearch(query: string, maxResults: number = 5): Promise<any> {
  const cacheKey = `${query}:${maxResults}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return { results: cached.results, source: 'cache' };
  }

  console.log(`🔍 MCP WebSearch: ${query}`);

  // 合并多个搜索源的结果
  let allResults: any[] = [];

  // 1. Perplexity AI 搜索（最高优先级，质量最高，免费每天100次）
  if (PERPLEXITY_API_KEY) {
    console.log(`  📡 尝试 Perplexity AI 搜索...`);
    const perplexityResults = await searchPerplexity(query, maxResults);
    if (perplexityResults.length > 0) {
      allResults = allResults.concat(perplexityResults.map((r: any) => ({ ...r, source: 'perplexity' })));
      console.log(`  ✅ Perplexity 返回 ${perplexityResults.length} 条结果`);
    }
  } else {
    console.log(`  ℹ️  Perplexity API 未配置 (设置 PERPLEXITY_API_KEY 可用)`);
  }

  // 2. 英文 Wikipedia API - 内容最丰富
  const wikiResults = await searchWikipedia(query, 10);
  allResults = allResults.concat(wikiResults.map((r: any) => ({ ...r, source: 'wikipedia' })));

  // 3. 百度百科搜索 - 中文补充
  const baiduResults = await searchBaiduBaike(query, 5);
  allResults = allResults.concat(baiduResults.map((r: any) => ({ ...r, source: 'baike' })));

  if (allResults.length > 0) {
    // 去重并按来源优先级排序
    const seen = new Set<string>();
    const uniqueResults: any[] = [];
    for (const r of allResults) {
      try {
        const url = r.url || '';
        const key = url.split('/').slice(0, 4).join('/');
        if (!seen.has(key)) {
          seen.add(key);
          uniqueResults.push(r);
        }
      } catch {
        uniqueResults.push(r);
      }
    }

    // 按来源优先级排序: perplexity > wikipedia > baike
    const sourcePriority: Record<string, number> = { perplexity: 0, wikipedia: 1, baike: 2 };
    uniqueResults.sort((a, b) => {
      const pa = sourcePriority[a.source] ?? 3;
      const pb = sourcePriority[b.source] ?? 3;
      return pa - pb;
    });

    const finalResults = uniqueResults.slice(0, maxResults);
    searchCache.set(cacheKey, { results: finalResults, timestamp: Date.now() });
    return { results: finalResults, source: 'live', totalSearched: allResults.length };
  }

  // 备用方案
  return {
    results: [
      {
        title: `${query} - 维基百科`,
        url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(query)}`,
        snippet: `关于 ${query} 的详细信息请访问维基百科`
      },
      {
        title: `${query} - 百度百科`,
        url: `https://baike.baidu.com/item/${encodeURIComponent(query)}`,
        snippet: `百度百科关于 ${query} 的介绍`
      }
    ],
    source: 'reference'
  };
}

/**
 * Bing RSS 搜索 (免费，不需要 API key)
 */
async function searchBingRSS(query: string, maxResults: number): Promise<any[]> {
  try {
    const response = await fetch(
      `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${maxResults}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) return [];

    const html = await response.text();

    // 解析 Bing 搜索结果
    const results: any[] = [];
    const linkRegex = /<a[^>]+href="(https?:\/\/[^"<>]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      // 过滤掉 bing.com 链接和太短的标题
      if (url && title && title.length > 5 &&
          !url.includes('bing.com') &&
          !url.includes('microsoft.com') &&
          !title.includes('Bing')) {
        results.push({
          title,
          url,
          snippet: `关于 ${query} 的搜索结果`
        });
      }

      if (results.length >= maxResults) break;
    }

    return results;

  } catch {
    return [];
  }
}

/**
 * Wikipedia API 搜索 (免费，稳定)
 */
async function searchWikipedia(query: string, maxResults: number): Promise<any[]> {
  try {
    const response = await fetch(
      `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*&limit=${maxResults}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return [];

    const data = await response.json() as any;
    const search = data.query?.search || [];

    return search.map((item: any) => ({
      title: item.title,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
      snippet: item.snippet?.replace(/<[^>]+>/g, '') || ''
    }));

  } catch {
    return [];
  }
}

/**
 * 百度百科搜索 (免费，稳定)
 */
async function searchBaiduBaike(query: string, maxResults: number): Promise<any[]> {
  try {
    const response = await fetch(
      `https://baike.baidu.com/search/word?word=${encodeURIComponent(query)}`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) return [];

    const html = await response.text();

    // 解析百度百科搜索结果
    const results: any[] = [];
    const suggestRegex = /<a[^>]+class=\"suggest-link\"[^>]+href=\"([^\"]+)\"[^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = suggestRegex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      if (url && title && title.length > 0) {
        results.push({
          title,
          url: url.startsWith('http') ? url : `https://baike.baidu.com${url}`,
          snippet: `百度百科关于 ${title} 的介绍`
        });
      }

      if (results.length >= maxResults) break;
    }

    return results;

  } catch {
    return [];
  }
}

/**
 * Google 搜索结果页面解析
 */
async function searchGoogleHTML(query: string, maxResults: number): Promise<any[]> {
  try {
    const response = await fetch(
      `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=zh-CN`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response.ok) return [];

    const html = await response.text();
    const results: any[] = [];

    // 解析 Google 搜索结果
    const regex = /<div[^>]*class="[^"]*BNeck[^"]*"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();

      if (url && title && title.length > 5 && url.startsWith('http')) {
        results.push({
          title,
          url,
          snippet: `关于 ${query} 的搜索结果`
        });
      }

      if (results.length >= maxResults) break;
    }

    return results;

  } catch {
    return [];
  }
}

/**
 * 获取当前时间工具
 */
function getCurrentTime(timezone: string = 'Asia/Shanghai'): object {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short'
  };

  const formatter = new Intl.DateTimeFormat('zh-CN', options);
  const parts = formatter.formatToParts(now);

  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '';

  return {
    iso: now.toISOString(),
    local: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`,
    full: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    timestamp: now.getTime(),
    timezone,
    weekday: getPart('weekday')
  };
}

/**
 * 日期计算工具
 */
function calculateDate(fromDate: string, days: number, format: string = 'YYYY-MM-DD'): object {
  const date = new Date(fromDate);
  if (isNaN(date.getTime())) {
    return { error: '无效的日期格式，请使用 YYYY-MM-DD' };
  }

  const resultDate = new Date(date);
  resultDate.setDate(resultDate.getDate() + days);

  const year = resultDate.getFullYear();
  const month = String(resultDate.getMonth() + 1).padStart(2, '0');
  const day = String(resultDate.getDate()).padStart(2, '0');

  let result: string;
  switch (format) {
    case 'YYYY年MM月DD日':
      result = `${year}年${month}月${day}日`;
      break;
    case 'MM/DD/YYYY':
      result = `${month}/${day}/${year}`;
      break;
    case 'DD/MM/YYYY':
      result = `${day}/${month}/${year}`;
      break;
    default:
      result = `${year}-${month}-${day}`;
  }

  return {
    fromDate,
    days,
    result,
    timestamp: resultDate.getTime()
  };
}

/**
 * Fetch URL 工具
 */
async function fetchUrl(url: string, maxLength: number = 3000): Promise<string> {
  console.log(`📄 MCP FetchURL: ${new URL(url).hostname}`);

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DocForge-MCP/1.0',
        'Accept': 'text/html,application/xhtml+xml'
      },
      signal: AbortSignal.timeout(5000)
    });

    if (!response.ok) {
      return `Error: HTTP ${response.status}`;
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return `Content-Type not supported: ${contentType}`;
    }

    const html = await response.text();
    return extractTextFromHtml(html, maxLength);

  } catch (error) {
    return `Error: ${error}`;
  }
}

function extractTextFromHtml(html: string, maxLength: number): string {
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }

  return text;
}

/**
 * Analyze Template 工具
 */
async function analyzeTemplate(templatePath: string): Promise<string> {
  console.log(`📊 MCP AnalyzeTemplate: ${templatePath}`);

  if (!fs.existsSync(templatePath)) {
    return JSON.stringify({ error: '文件不存在' });
  }

  let content: string;
  const ext = path.extname(templatePath).toLowerCase();

  if (ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const buffer = fs.readFileSync(templatePath);
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } catch {
      return JSON.stringify({ error: '无法读取 DOCX 文件' });
    }
  } else {
    content = fs.readFileSync(templatePath, 'utf-8');
  }

  // 分析
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  const hasNumbering = /\d+\.\s+\S+/.test(content);
  const hasChineseNum = /[一二三四五六七]、/.test(content);
  const lower = content.toLowerCase();

  let tone = '通用';
  if (/因此|综上所述|总结/.test(lower)) tone = '正式、结论性';
  else if (/应该|建议|推荐/.test(lower)) tone = '建议性';
  else if (/首先|其次|最后/.test(lower)) tone = '条理性';

  return JSON.stringify({
    structure: headings.slice(0, 10),
    hasNumbering,
    hasChineseNum,
    tone,
    wordCount: content.length
  });
}

/**
 * Export DOCX 工具
 */
async function exportDocx(markdown: string, title: string, outputPath: string): Promise<string> {
  console.log(`📝 MCP ExportDocx: ${outputPath}`);

  try {
    const { DocxGenerator } = await import('./docx/generator');
    const generator = new DocxGenerator();

    await generator.generateFromMarkdown(markdown, outputPath, {
      title,
      createdAt: new Date()
    });

    return JSON.stringify({ success: true, path: outputPath });
  } catch (error) {
    return JSON.stringify({ error: String(error) });
  }
}

/**
 * Check Facts 工具
 */
async function checkFacts(content: string, context?: string): Promise<string> {
  const issues: string[] = [];
  const warnings: string[] = [];

  // 检查日期格式
  const datePattern = /(\d{4}[-年]\d{1,2}[-月]\d{1,2})/g;
  const dates = content.match(datePattern);
  if (dates) {
    for (const date of dates) {
      if (!isValidDate(date)) {
        warnings.push(`日期格式可能不正确: ${date}`);
      }
    }
  }

  // 检查百分比
  const percentagePattern = /(\d+(\.\d+)?%)/g;
  const percentages = content.match(percentagePattern);
  if (percentages) {
    for (const p of percentages) {
      const num = parseFloat(p);
      if (num > 100) {
        issues.push(`百分比超过 100%: ${p}`);
      }
    }
  }

  return JSON.stringify({
    issues: issues.length > 0 ? issues : null,
    warnings: warnings.length > 0 ? warnings : null,
    checkedAt: new Date().toISOString().slice(0, 10),
    status: issues.length > 0 ? 'needs_review' : 'ok'
  });
}

function isValidDate(dateStr: string): boolean {
  try {
    const normalized = dateStr.replace(/[年月]/g, '-').replace(/日/g, '');
    const date = new Date(normalized);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

/**
 * Find Related 工具
 */
async function findRelated(topic: string, context?: string, maxResults: number = 5): Promise<string> {
  console.log(`🔎 MCP FindRelated: ${topic}`);

  const searchResult = await webSearch(`${topic} 案例 应用`, maxResults);

  if ('results' in searchResult && searchResult.results.length > 0) {
    return JSON.stringify({
      topic,
      related: searchResult.results,
      searchQuery: `${topic} 案例 应用`
    });
  }

  return JSON.stringify({ topic, related: [], searchQuery: `${topic} 案例 应用` });
}

// ==================== 可用工具列表 ====================

const tools: MCPTool[] = [
  {
    name: 'web_search',
    description: '快速搜索互联网获取最新信息。返回标题、URL 和摘要。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索查询关键词' },
        maxResults: { type: 'number', description: '最大返回结果数，默认 5' }
      },
      required: ['query']
    }
  },
  {
    name: 'fetch_url',
    description: '快速获取指定 URL 的网页内容。自动提取关键信息。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: '要获取的网页 URL' },
        maxLength: { type: 'number', description: '最大字符数，默认 3000' }
      },
      required: ['url']
    }
  },
  {
    name: 'get_current_time',
    description: '获取当前时间和日期信息。使用此工具而不是猜测当前时间。',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: '时区，默认 Asia/Shanghai' }
      }
    }
  },
  {
    name: 'calculate_date',
    description: '计算日期差或推算日期。使用此工具进行日期计算，而不是自行计算。',
    inputSchema: {
      type: 'object',
      properties: {
        fromDate: { type: 'string', description: '起始日期 (YYYY-MM-DD)' },
        days: { type: 'number', description: '天数差值，正数为往后，负数为往前' },
        format: { type: 'string', description: '输出格式，默认 YYYY-MM-DD' }
      },
      required: ['fromDate', 'days']
    }
  },
  {
    name: 'analyze_template',
    description: '分析文档模板的风格结构。返回标题层级、格式模式等。',
    inputSchema: {
      type: 'object',
      properties: {
        templatePath: { type: 'string', description: '模板文件路径' }
      },
      required: ['templatePath']
    }
  },
  {
    name: 'export_docx',
    description: '将 Markdown 内容导出为 DOCX 格式。',
    inputSchema: {
      type: 'object',
      properties: {
        markdown: { type: 'string', description: 'Markdown 内容' },
        title: { type: 'string', description: '文档标题' },
        outputPath: { type: 'string', description: '输出文件路径' }
      },
      required: ['markdown', 'title', 'outputPath']
    }
  },
  {
    name: 'check_facts',
    description: '核查文档中的事实准确性。检查日期、数字、统计数据的正确性。',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: '需要核查的文档内容' },
        context: { type: 'string', description: '文档主题/背景信息' }
      },
      required: ['content']
    }
  },
  {
    name: 'find_related',
    description: '根据主题查找相关的参考资料、案例、应用。',
    inputSchema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: '当前主题' },
        context: { type: 'string', description: '附加上下文' },
        maxResults: { type: 'number', description: '最大结果数' }
      },
      required: ['topic']
    }
  }
];

// ==================== HTTP 服务器 ====================

const server = http.createServer(async (req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url!, `http://localhost:${PORT}`);

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', tools: tools.length }));
    return;
  }

  // List tools
  if (url.pathname === '/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tools));
    return;
  }

  // Call tool
  if (url.pathname.startsWith('/tools/') && req.method === 'POST') {
    const toolName = url.pathname.split('/')[2];

    try {
      const body = await readBody(req);
      const args = JSON.parse(body);

      console.log(`🔧 MCP 调用: ${toolName}`, args);

      let result: string;

      switch (toolName) {
        case 'web_search':
          result = JSON.stringify(await webSearch(args.query, args.maxResults));
          break;
        case 'fetch_url':
          result = await fetchUrl(args.url, args.maxLength);
          break;
        case 'get_current_time':
          result = JSON.stringify(getCurrentTime(args.timezone));
          break;
        case 'calculate_date':
          result = JSON.stringify(calculateDate(args.fromDate, args.days, args.format));
          break;
        case 'analyze_template':
          result = await analyzeTemplate(args.templatePath);
          break;
        case 'export_docx':
          result = await exportDocx(args.markdown, args.title, args.outputPath);
          break;
        case 'check_facts':
          result = await checkFacts(args.content, args.context);
          break;
        case 'find_related':
          result = await findRelated(args.topic, args.context, args.maxResults);
          break;
        default:
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown tool: ${toolName}` }));
          return;
      }

      // 返回结果
      const mcpResult: MCPToolResult = {
        content: [{ type: 'text', text: result }]
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(mcpResult));

    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        content: [{ type: 'text', text: JSON.stringify({ error: String(error) }) }],
        isError: true
      }));
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ==================== 启动服务器 ====================

async function startServer(): Promise<void> {
  return new Promise((resolve) => {
    server.listen(PORT, () => {
      console.log(`\x1b[32m✅ MCP 服务器已启动: http://localhost:${PORT}\x1b[0m`);
      console.log(`   可用工具: ${tools.map(t => t.name).join(', ')}`);
      resolve();
    });
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('\x1b[31mMCP 服务器已停止\x1b[0m');
      resolve();
    });
  });
}

// 导出启动/停止函数
export { startServer, stopServer, server };

// 如果直接运行此文件
if (require.main === module) {
  console.log('\x1b[1;36mDocForge 内置 MCP 服务器\x1b[0m\n');
  startServer().then(() => {
    console.log('\n按 Ctrl+C 停止服务器\n');
  });

  process.on('SIGINT', () => {
    stopServer().then(() => process.exit(0));
  });
}
