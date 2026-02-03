/**
 * DocForge Skills System - 文档生成专用工具集
 *
 * 设计原则：
 * 1. Skills 是工具，LLM 可以根据需要自主调用
 * 2. 每个 Skill 都有清晰的描述、参数和返回值
 * 3. 通过 function calling 机制让模型选择使用
 */

import * as fs from 'fs';
import * as path from 'path';
import * as mammoth from 'mammoth';

// ==================== Skill 定义 ====================

export interface Skill {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface TemplateAnalysis {
  structure: string[];
  headingStyles: string[];
  formatPatterns: string[];
  tone: string;
  keyPhrases: string[];
}

// ==================== Skill 1: Fast Web Search ====================

// 搜索缓存
const searchCache = new Map<string, { results: SearchResult[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

const webSearchSkill: Skill = {
  name: 'web_search',
  description: '快速搜索互联网获取最新信息。当你需要获取时效性信息、统计数据、新闻、学术资料等时使用。返回标题、URL 和摘要。',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询关键词，用中文或英文均可'
      },
      maxResults: {
        type: 'number',
        description: '最大返回结果数，默认5',
        default: 5
      }
    },
    required: ['query']
  },
  async handler(args: { query: string; maxResults?: number }) {
    const { query, maxResults = 5 } = args;
    const cacheKey = `${query}:${maxResults}`;

    // 检查缓存
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`📦 使用缓存: ${query}`);
      return { results: cached.results, source: 'cache' };
    }

    console.log(`🔍 快速搜索: ${query}`);

    // 并行尝试多个搜索源
    const searchPromises = [
      searchDuckDuckGo(query, maxResults),
      searchBing(query, maxResults).catch(() => null)
    ];

    const results = await Promise.race(searchPromises);

    if (results && results.length > 0) {
      // 缓存结果
      searchCache.set(cacheKey, { results, timestamp: Date.now() });
      console.log(`✅ 找到 ${results.length} 条结果`);
      return { results, source: 'live' };
    }

    // 如果所有搜索都失败，返回快速结果
    console.log(`⚠️  搜索服务暂时不可用，返回快速参考信息`);
    return getQuickReference(query, maxResults);
  }
};

// DuckDuckGo 搜索（快速）
async function searchDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&kl=cn-zh`,
      {
        signal: AbortSignal.timeout(3000) // 3秒超时
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const dataObj = data as any;

    if (!dataObj.RelatedTopics || dataObj.RelatedTopics.length === 0) return [];

    return dataObj.RelatedTopics.slice(0, maxResults).map((topic: any) => ({
      title: topic.FirstURL?.split('/').pop() || '未知标题',
      url: topic.FirstURL || '',
      snippet: topic.Text || ''
    }));

  } catch (error) {
    return [];
  }
}

// Bing 搜索（备用）
async function searchBing(query: string, maxResults: number): Promise<SearchResult[]> {
  try {
    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}`,
      {
        signal: AbortSignal.timeout(3000),
        headers: {
          // 注意：需要真实的 API key
        }
      }
    );

    if (!response.ok) return [];

    const data = await response.json();
    const dataObj = data as any;
    return (dataObj.webPages?.value || []).slice(0, maxResults).map((item: any) => ({
      title: item.name || '未知标题',
      url: item.url || '',
      snippet: item.snippet || ''
    }));

  } catch (error) {
    return [];
  }
}

// 快速参考信息（当搜索服务不可用时）
function getQuickReference(query: string, maxResults: number): { results: SearchResult[]; source: string } {
  const results: SearchResult[] = [
    {
      title: `${query} - 维基百科`,
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(query)}`,
      snippet: `关于 ${query} 的详细介绍...`
    },
    {
      title: `${query} - 百度百科`,
      url: `https://baike.baidu.com/item/${encodeURIComponent(query)}`,
      snippet: `百度百科关于 ${query} 的权威解释...`
    },
    {
      title: `${query} - 相关信息搜索`,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: `使用 Google 搜索更多关于 ${query} 的信息...`
    }
  ];

  return { results: results.slice(0, maxResults), source: 'reference' };
}

// ==================== Skill 2: Fast Fetch URL ====================

const fetchUrlSkill: Skill = {
  name: 'fetch_url',
  description: '快速获取指定 URL 的网页内容。用于获取参考文档、技术文档、新闻文章等详细内容。自动提取关键信息。',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要获取的网页 URL'
      },
      extractText: {
        type: 'boolean',
        description: '是否只提取文本（去除 HTML），默认 true',
        default: true
      },
      maxLength: {
        type: 'number',
        description: '最大提取字符数，默认 3000',
        default: 3000
      }
    },
    required: ['url']
  },
  async handler(args: { url: string; extractText?: boolean; maxLength?: number }) {
    const { url, extractText = true, maxLength = 3000 } = args;
    console.log(`📄 快速获取: ${new URL(url).hostname}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DocForge/1.0 (Document Generator)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        },
        signal: AbortSignal.timeout(5000) // 5秒超时
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (extractText && contentType.includes('text/html')) {
        const html = await response.text();
        const text = extractTextFromHtmlSmart(html, maxLength);
        return {
          content: text,
          url,
          title: extractTitleFromHtml(html) || url,
          wordCount: text.length
        };
      }

      return {
        content: await response.text(),
        url,
        title: url
      };

    } catch (error) {
      return {
        error: `获取失败: ${error}`,
        url
      };
    }
  }
};

// 智能 HTML 文本提取（更快更准确）
function extractTextFromHtmlSmart(html: string, maxLength: number): string {
  // 移除脚本和样式
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
    .replace(/<[^>]+>/g, ' ')  // 用空格替代标签
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')  // 合并空白
    .trim();

  // 截取最大长度
  if (text.length > maxLength) {
    text = text.slice(0, maxLength) + '...';
  }

  return text;
}

function extractTextFromHtml(html: string): string {
  // 简单的 HTML 到文本转换
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

// ==================== Skill 3: Analyze Template ====================

const analyzeTemplateSkill: Skill = {
  name: 'analyze_template',
  description: '深度分析参考文档模板的结构、格式、风格特点。返回标题层级、格式模式、语气特点等，用于生成风格一致的文档。',
  parameters: {
    type: 'object',
    properties: {
      templatePath: {
        type: 'string',
        description: '模板文件路径'
      }
    },
    required: ['templatePath']
  },
  async handler(args: { templatePath: string }) {
    const { templatePath } = args;
    console.log(`📊 分析模板: ${templatePath}`);

    if (!fs.existsSync(templatePath)) {
      return { error: `文件不存在: ${templatePath}` };
    }

    try {
      let content: string;
      const ext = path.extname(templatePath).toLowerCase();

      if (ext === '.docx') {
        const buffer = fs.readFileSync(templatePath);
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else {
        content = fs.readFileSync(templatePath, 'utf-8');
      }

      // 分析结构
      const structure = analyzeStructure(content);
      const headingStyles = extractHeadingStyles(content);
      const formatPatterns = findFormatPatterns(content);
      const tone = analyzeTone(content);
      const keyPhrases = extractKeyPhrases(content);

      return {
        structure,
        headingStyles,
        formatPatterns,
        tone,
        keyPhrases,
        wordCount: content.length
      };

    } catch (error) {
      return { error: `分析失败: ${error}` };
    }
  }
};

function analyzeStructure(content: string): string[] {
  const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
  return headings.slice(0, 10); // 只返回前10个标题
}

function extractHeadingStyles(content: string): string[] {
  const patterns: string[] = [];

  // 检测常见的中文标题格式
  if (/^\s*\d+\.\s+\S+/m.test(content)) patterns.push('数字编号: 1. 2. 3.');
  if (/^\s*[\u4e00-\u9fa5]+\s*[\u3000-\u303F]/m.test(content)) patterns.push('中文数字: 一、二、三');
  if (/^\s*第[\u4e00-\u9fa5]+\s+\S+/m.test(content)) patterns.push('章节编号: 第一章、第二节');
  if (/^#+ .+$/m.test(content)) patterns.push('Markdown 标题: # ## ###');

  return patterns;
}

function findFormatPatterns(content: string): string[] {
  const patterns: string[] = [];

  if (/「|」|『|』/.test(content)) patterns.push('使用中文引号');
  const parenMatches = content.match(/（[^）]+）/g);
  if (parenMatches && parenMatches.length > 0) patterns.push('使用中文括号');
  if (/\d+\.\d+/.test(content)) patterns.push('包含小数数字');
  if (/表\s*\d+/.test(content)) patterns.push('包含表格引用');
  if (/图\s*\d+/.test(content)) patterns.push('包含图片引用');

  return patterns;
}

function analyzeTone(content: string): string {
  const lower = content.toLowerCase();

  if (/因此|综上所述|总之/m.test(lower)) return '正式、结论性';
  if (/根据|依据|参照/m.test(lower)) return '规范性';
  if (/首先|其次|最后/m.test(lower)) return '条理性';
  if (/应该|建议|推荐/m.test(lower)) return '建议性';

  return '通用';
}

function extractKeyPhrases(content: string): string[] {
  // 提取常见的专业术语和关键短语
  const phrases: string[] = [];
  const patterns = [
    /[\u4e00-\u9fa5]{4,8}(?:性|化|率|度|方式|方法)/g,
    /(?:基于|通过|利用|使用)\s*[\u4e00-\u9fa5]+/g,
    /(?:实现|应用|采用)\s*[\u4e00-\u9fa5]+/g
  ];

  for (const pattern of patterns) {
    const matches = content.match(pattern) || [];
    phrases.push(...matches.slice(0, 5));
  }

  return [...new Set(phrases)].slice(0, 10);
}

// ==================== Skill 4: Export DOCX ====================

const exportDocxSkill: Skill = {
  name: 'export_docx',
  description: '将 Markdown 内容导出为 DOCX 格式。生成的文档可以用于正式排版和打印。',
  parameters: {
    type: 'object',
    properties: {
      markdown: {
        type: 'string',
        description: 'Markdown 内容'
      },
      title: {
        type: 'string',
        description: '文档标题'
      },
      outputPath: {
        type: 'string',
        description: '输出文件路径'
      }
    },
    required: ['markdown', 'title', 'outputPath']
  },
  async handler(args: { markdown: string; title: string; outputPath: string }) {
    const { markdown, title, outputPath } = args;
    console.log(`📝 导出 DOCX: ${outputPath}`);

    try {
      // 动态导入 DocxGenerator
      const { DocxGenerator } = await import('../docx/generator');
      const generator = new DocxGenerator();

      await generator.generateFromMarkdown(markdown, outputPath, {
        title,
        createdAt: new Date()
      });

      return {
        success: true,
        path: outputPath
      };

    } catch (error) {
      return {
        success: false,
        error: String(error)
      };
    }
  }
};

// ==================== Skill 5: Check Facts ====================

const checkFactsSkill: Skill = {
  name: 'check_facts',
  description: '核查文档中的事实准确性。包括日期、数字、统计数据、引用来源等。用于确保生成的文档内容可靠。',
  parameters: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: '需要核查的文档内容'
      },
      context: {
        type: 'string',
        description: '文档主题/背景信息（可选）'
      }
    },
    required: ['content']
  },
  async handler(args: { content: string; context?: string }) {
    const { content, context } = args;
    console.log(`✅ 事实核查...`);

    const issues: string[] = [];
    const warnings: string[] = [];

    // 检查日期
    const datePattern = /(\d{4}[-年]\d{1,2}[-月]\d{1,2})|(\d{1,2}[月]\d{1,2}[日])/g;
    const dates = content.match(datePattern);
    if (dates) {
      for (const date of dates) {
        if (!isValidDate(date)) {
          warnings.push(`日期格式可能不正确: ${date}`);
        }
      }
    }

    // 检查数字范围
    const percentagePattern = /\d+(\.\d+)?%/g;
    const percentages = content.match(percentagePattern);
    if (percentages) {
      for (const p of percentages) {
        const num = parseFloat(p);
        if (num > 100) {
          issues.push(`百分比超过 100%: ${p}`);
        }
      }
    }

    // 检查具体数据
    const dataPattern = /(约为|大约|约)\s*(\d+(\.\d+)?[万千万亿])/g;
    if (dataPattern.test(content)) {
      warnings.push('包含估算数据，请确保来源可靠');
    }

    // 检查引用
    const citationPattern = /（来源：|据|根据）.+$/gm;
    if (!citationPattern.test(content) && content.length > 500) {
      warnings.push('文档较长但缺少明确的数据来源引用');
    }

    const currentDate = new Date().toISOString().slice(0, 10);
    return {
      issues: issues.length > 0 ? issues : null,
      warnings: warnings.length > 0 ? warnings : null,
      checkedAt: currentDate,
      status: issues.length > 0 ? 'needs_review' : 'ok'
    };
  }
};

function isValidDate(dateStr: string): boolean {
  try {
    const normalized = dateStr.replace(/[年月]/g, '-').replace(/日/g, '');
    const date = new Date(normalized);
    return !isNaN(date.getTime());
  } catch {
    return false;
  }
}

// ==================== Skill 6: Find Related ====================

const findRelatedSkill: Skill = {
  name: 'find_related',
  description: '根据当前主题查找相关的参考资料、文献、案例等。用于丰富文档内容。',
  parameters: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: '当前主题'
      },
      context: {
        type: 'string',
        description: '附加上下文信息'
      },
      maxResults: {
        type: 'number',
        description: '最大结果数',
        default: 5
      }
    },
    required: ['topic']
  },
  async handler(args: { topic: string; context?: string; maxResults?: number }) {
    const { topic, context, maxResults = 5 } = args;
    console.log(`🔎 查找相关资料: ${topic}`);

    // 组合搜索查询
    const searchQuery = context
      ? `${topic} ${context} 案例 应用`
      : `${topic} 介绍 应用 案例`;

    // 先搜索
    const searchResult = await webSearchSkill.handler({ query: searchQuery, maxResults });

    // 如果搜索成功，尝试获取详细内容
    if ('results' in searchResult && searchResult.results.length > 0) {
      const relatedContent = [];

      for (const result of searchResult.results.slice(0, 3)) {
        const fetchResult = await fetchUrlSkill.handler({
          url: result.url,
          extractText: true
        });

        if ('content' in fetchResult) {
          relatedContent.push({
            title: result.title,
            url: result.url,
            summary: result.snippet,
            content: fetchResult.content.slice(0, 500)
          });
        }
      }

      return {
        topic,
        related: relatedContent,
        searchQuery
      };
    }

    return {
      topic,
      related: [],
      searchQuery
    };
  }
};

// ==================== Skills Registry ====================

export const SKILLS: Skill[] = [
  webSearchSkill,
  fetchUrlSkill,
  analyzeTemplateSkill,
  exportDocxSkill,
  checkFactsSkill,
  findRelatedSkill
];

export const SKILLS_REGISTRY = {
  skills: SKILLS.map(s => ({
    name: s.name,
    description: s.description,
    parameters: s.parameters
  })),
  getSkill(name: string): Skill | undefined {
    return SKILLS.find(s => s.name === name);
  },
  async execute(name: string, args: any): Promise<any> {
    const skill = this.getSkill(name);
    if (!skill) {
      return { error: `未知技能: ${name}` };
    }
    return skill.handler(args);
  }
};

// ==================== System Prompt 集成 ====================

export function getSkillsSystemPrompt(): string {
  // 构建 Skills 描述
  const skillsList: string[] = [];

  for (const s of SKILLS) {
    let paramsDesc = '';
    for (const [name, schema] of Object.entries(s.parameters.properties)) {
      const required = s.parameters.required?.includes(name) ? ' (必需)' : '';
      paramsDesc += `- ${name}: ${schema.description}${required}\n`;
    }
    skillsList.push(`## ${s.name}\n\n${s.description}\n\n参数:\n${paramsDesc}`);
  }

  const skillsDesc = skillsList.join('\n\n');

  return `你是一个专业的文档撰写助手。你可以使用以下工具来辅助生成高质量文档：

${skillsDesc}

使用规则：
1. 当需要获取最新信息时，使用 web_search
2. 当需要深入了解某个主题时，使用 fetch_url
3. 当需要分析模板风格时，使用 analyze_template
4. 当需要导出 DOCX 格式时，使用 export_docx
5. 当需要核查事实准确性时，使用 check_facts
6. 当需要查找相关参考资料时，使用 find_related

请根据需要自主选择合适的工具，无需询问用户。`;
}

export default SKILLS_REGISTRY;
