/**
 * DocForge Agent - 智能文档生成代理
 *
 * 核心职责：
 * 1. 理解用户需求
 * 2. 自主决定是否需要调用工具
 * 3. 调用 MCP 工具获取信息
 * 4. 生成高质量文档
 *
 * 工作流程：
 * 1. 接收用户请求（主题、描述、模板）
 * 2. 分析是否需要搜索最新信息
 * 3. 如果需要，调用 MCP 工具
 * 4. 基于所有信息生成文档
 */

import { MCPClient, getMCPClient, MCPTool } from './mcp-client';
import { LLMClient, createLLMClient, ChatMessage, extractText } from '../llm/client';
import { DocxGenerator } from '../docx/generator';
import { SKILLS_REGISTRY, getSkillsSystemPrompt } from './skills';
import * as fs from 'fs';
import * as path from 'path';
import * as mammoth from 'mammoth';

export interface AgentOptions {
  llmClient?: LLMClient;
  mcpClient?: MCPClient;
  mcpServerUrl?: string;
  autoConnectMCP?: boolean;
}

export interface DocumentRequest {
  topic: string;
  description: string;
  templatePath?: string;
  searchForLatest?: boolean; // 是否搜索最新信息
  searchQuery?: string; // 自定义搜索关键词
}

export interface DocumentResult {
  success: boolean;
  mdPath?: string;
  docxPath?: string;
  usedTools: string[];
  summary: string;
  error?: string;
}

export interface ToolCall {
  tool: string;
  args: Record<string, any>;
  result?: any;
}

// 工具调用分析结果
interface ToolAnalysis {
  needsSearch: boolean;
  needsFetch: boolean;
  needsTemplateAnalysis: boolean;
  needsExport: boolean;
  searchQuery?: string;
  urls?: string[];
}

export class DocForgeAgent {
  private llmClient: LLMClient;
  private mcpClient: MCPClient;
  private docxGenerator: DocxGenerator;
  private mcpServerUrl: string;

  constructor(options: AgentOptions = {}) {
    this.llmClient = options.llmClient || createLLMClient();
    this.mcpClient = options.mcpClient || getMCPClient();
    this.docxGenerator = new DocxGenerator();
    this.mcpServerUrl = options.mcpServerUrl || process.env.MCP_SERVER_URL || 'http://localhost:19842';

    // 自动连接 MCP 服务器
    if (options.autoConnectMCP !== false) {
      // 异步连接，不阻塞构造
      this.connectMCP().catch(() => {});
    }
  }

  /**
   * 连接 MCP 服务器
   */
  async connectMCP(): Promise<boolean> {
    if (this.mcpClient.isConnected(this.mcpServerUrl)) {
      return true;
    }
    return this.mcpClient.connect(this.mcpServerUrl);
  }

  /**
   * 断开 MCP 服务器
   */
  disconnectMCP(): void {
    this.mcpClient.disconnect(this.mcpServerUrl);
  }

  /**
   * 检查 MCP 是否可用
   */
  isMCPAvailable(): boolean {
    return this.mcpClient.isConnected(this.mcpServerUrl);
  }

  /**
   * 获取可用工具列表
   */
  getAvailableTools(): MCPTool[] {
    return this.mcpClient.getAllTools();
  }

  /**
   * 核心方法：生成文档
   */
  async generateDocument(request: DocumentRequest): Promise<DocumentResult> {
    const usedTools: string[] = [];
    const toolCalls: ToolCall[] = [];

    console.clear();
    console.log('\n');
    console.log(' ╔════════════════════════════════════════════════════╗');
    console.log(' ║           🤖 DocForge Agent 文档生成器              ║');
    console.log(' ╚════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`   主题: ${request.topic}`);
    console.log(`   描述: ${request.description || '无'}`);
    console.log('');

    try {
      // Step 1: 分析需求
      console.log(' ╔════════════════════════════════════════════════════╗');
      console.log(' ║  Step 1: 分析需求                                    ║');
      console.log(' ╚════════════════════════════════════════════════════╝');
      const analysis = await this.analyzeNeeds(request);
      console.log(`   需要搜索最新信息: ${analysis.needsSearch ? '是' : '否'}`);
      console.log(`   搜索关键词: ${analysis.searchQuery || request.topic}`);
      console.log('');

      // Step 2: 调用 MCP 工具获取信息
      console.log(' ╔════════════════════════════════════════════════════╗');
      console.log(' ║  Step 2: 获取信息                                    ║');
      console.log(' ╚════════════════════════════════════════════════════╝');

      // 尝试连接 MCP
      if (!this.isMCPAvailable()) {
        console.log('   🔗 正在连接 MCP 服务器...');
        await this.connectMCP();
        console.log(`   ${this.isMCPAvailable() ? '✅ 已连接' : '❌ 连接失败'}`);
      }

      if (this.isMCPAvailable()) {
        // 显示可用的 MCP 工具
        const tools = this.mcpClient.getAllTools();
        const toolNames = tools.map(t => t.name).join(', ');
        console.log(`   可用工具: ${toolNames}`);
        console.log('');

        // 执行搜索
        const searchQuery = analysis.searchQuery || request.searchQuery || request.topic;
        console.log(`   🔍 搜索: "${searchQuery}"`);
        const searchResults = await this.mcpClient.search(searchQuery, 5);
        toolCalls.push({
          tool: 'web_search',
          args: { query: searchQuery, maxResults: 5 },
          result: searchResults
        });
        usedTools.push('web_search');
        console.log(`   ✅ 找到 ${searchResults.length} 条结果`);
        for (let i = 0; i < Math.min(3, searchResults.length); i++) {
          const r = searchResults[i];
          console.log(`      ${i + 1}. ${r.title?.slice(0, 40)}...`);
        }

        // 获取当前时间（用于日期计算）
        try {
          const timeResult = await this.mcpClient.callTool(this.mcpServerUrl, 'get_current_time', {});
          console.log(`   🕐 当前时间: ${JSON.parse(timeResult.content[0].text || '{}').full || '已知'}`);
        } catch {
          // 忽略时间获取错误
        }
      } else {
        console.log('   ⚠️  MCP 服务器不可用');
        console.log('   💡 提示: 运行 "docforge mcp" 启动 MCP 服务器');
      }
      console.log('');

      // Step 3: 如果有模板，分析模板风格
      console.log(' ╔════════════════════════════════════════════════════╗');
      console.log(' ║  Step 3: 分析模板                                    ║');
      console.log(' ╚════════════════════════════════════════════════════╝');
      let templateAnalysis = '';
      if (request.templatePath && fs.existsSync(request.templatePath)) {
        console.log(`   模板: ${path.basename(request.templatePath)}`);
        templateAnalysis = await this.analyzeTemplate(request.templatePath);
        toolCalls.push({
          tool: 'analyze_template',
          args: { templatePath: request.templatePath },
          result: templateAnalysis
        });
        usedTools.push('analyze_template');
        console.log('   ✅ 模板分析完成');
      } else {
        console.log('   无模板，使用默认格式');
      }
      console.log('');

      // Step 4: 生成文档内容
      console.log(' ╔════════════════════════════════════════════════════╗');
      console.log(' ║  Step 4: 生成文档内容                                ║');
      console.log(' ╚════════════════════════════════════════════════════╝');
      console.log('   正在调用 LLM 生成文档...');
      const content = await this.generateContent(request, templateAnalysis, toolCalls);
      usedTools.push('llm');
      console.log(`   ✅ 生成完成 (${content.length} 字符)`);
      console.log('');

      // Step 5: 保存文件
      console.log(' ╔════════════════════════════════════════════════════╗');
      console.log(' ║  Step 5: 保存文档                                    ║');
      console.log(' ╚════════════════════════════════════════════════════╝');
      const paths = await this.saveDocument(request.topic, content);
      usedTools.push('export');
      console.log(`   📄 Markdown: ${paths.mdPath}`);
      console.log(`   📝 DOCX: ${paths.docxPath}`);
      console.log('');

      console.log('\n✅ 文档生成完成！');
      if (usedTools.length > 0) {
        console.log(`使用的工具: ${usedTools.filter((t, i) => usedTools.indexOf(t) === i).join(', ')}`);
      }

      return {
        success: true,
        mdPath: paths.mdPath,
        docxPath: paths.docxPath,
        usedTools: [...new Set(usedTools)],
        summary: `成功生成文档，包含 ${content.length} 字符`
      };

    } catch (error) {
      console.error(`\n❌ 错误: ${error}`);
      return {
        success: false,
        usedTools,
        summary: '文档生成失败',
        error: String(error)
      };
    }
  }

  /**
   * 分析需求，决定是否需要调用工具
   */
  private async analyzeNeeds(request: DocumentRequest): Promise<ToolAnalysis> {
    // 如果用户明确要求搜索，直接返回需要搜索
    if (request.searchForLatest || request.searchQuery) {
      return {
        needsSearch: true,
        needsFetch: false,
        needsTemplateAnalysis: false,
        needsExport: true,
        searchQuery: request.searchQuery
      };
    }

    // 使用 LLM 分析是否需要搜索
    const currentDate = new Date().toISOString().slice(0, 10);
    const prompt = `分析以下文档生成需求，判断是否需要搜索最新信息：

主题：${request.topic}
描述：${request.description}
当前日期：${currentDate}

请判断并输出 JSON：
{
  "needsSearch": true/false,
  "searchQuery": "如果需要搜索，生成搜索关键词",
  "reason": "判断理由"
}`;

    try {
      const response = await this.llmClient.chat({
        model: this.llmClient.getModelId(),
        messages: [{ role: 'user', content: prompt }],
        enableThinking: false,
        temperature: 0.3
      });

      const content = extractText(response.choices[0].message.content);
      const jsonMatch = content.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          needsSearch: result.needsSearch || false,
          needsFetch: result.needsFetch || false,
          needsTemplateAnalysis: false,
          needsExport: true,
          searchQuery: result.searchQuery
        };
      }
    } catch (error) {
      // 如果分析失败，默认不搜索
      console.warn('需求分析失败，默认不搜索');
    }

    return {
      needsSearch: false,
      needsFetch: false,
      needsTemplateAnalysis: false,
      needsExport: true
    };
  }

  /**
   * 分析模板风格
   */
  private async analyzeTemplate(templatePath: string): Promise<string> {
    let content: string;
    const ext = path.extname(templatePath).toLowerCase();

    if (ext === '.docx') {
      const buffer = fs.readFileSync(templatePath);
      const result = await mammoth.extractRawText({ buffer });
      content = result.value;
    } else {
      content = fs.readFileSync(templatePath, 'utf-8');
    }

    // 提取关键信息
    const headings = content.match(/^#{1,6}\s+.+$/gm) || [];
    const hasNumbering = /\d+\.\s+\S+/.test(content);
    const hasChineseNum = /[一二三四五六七]、/.test(content);

    return JSON.stringify({
      structure: headings.slice(0, 10),
      hasNumbering,
      hasChineseNum,
      tone: this.detectTone(content)
    });
  }

  /**
   * 检测文档语气
   */
  private detectTone(content: string): string {
    const lower = content.toLowerCase();
    if (/因此|综上所述|结论/.test(lower)) return '正式、结论性';
    if (/应该|建议|推荐/.test(lower)) return '建议性';
    if (/首先|其次|最后/.test(lower)) return '条理性';
    return '通用';
  }

  /**
   * 生成文档内容
   */
  private async generateContent(
    request: DocumentRequest,
    templateAnalysis: string,
    toolCalls: ToolCall[]
  ): Promise<string> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    const currentDateStr = `${currentYear}年${currentMonth}月${currentDay}日`;

    // 构建上下文
    let contextSection = '';
    if (toolCalls.length > 0) {
      const searchResults = toolCalls
        .filter(t => t.tool === 'web_search' && t.result)
        .map(t => (t.result as any).map((r: any) =>
          `【${r.title}】${r.snippet}\n来源: ${r.url}`
        ).join('\n\n'))
        .join('\n\n---\n\n');

      if (searchResults) {
        contextSection = `\n\n【最新参考资料】\n${searchResults}\n\n请结合上述最新参考资料生成内容，确保信息准确且具有时效性。`;
      }
    }

    // 模板风格说明
    let styleSection = '';
    if (templateAnalysis) {
      try {
        const analysis = JSON.parse(templateAnalysis);
        styleSection = `\n\n【模板风格参考】\n`;
        if (analysis.structure) {
          styleSection += `标题层级: ${analysis.structure.slice(0, 5).join(' → ')}\n`;
        }
        if (analysis.hasNumbering) styleSection += `编号格式: 数字编号 (1. 2. 3.)\n`;
        if (analysis.hasChineseNum) styleSection += `编号格式: 中文数字 (一、二、三)\n`;
        styleSection += `语气: ${analysis.tone}`;
      } catch {
        // 忽略解析错误
      }
    }

    // 获取 Skills 系统提示词
    const skillsPrompt = getSkillsSystemPrompt();

    // 构建完整 prompt
    const prompt = `${skillsPrompt}

【当前时间】${currentDateStr}

【任务】
文档主题：${request.topic}
文档描述：${request.description}${contextSection}${styleSection}

【要求】
1. 使用 Markdown 格式输出
2. 遵循学术/专业文档风格
3. 每个章节要有充实的内容
4. 使用中文标点符号（，。：；""等）
5. 内容要详实、深入、专业
6. 文档中涉及日期、时间等时效性信息时，以当前时间 ${currentDateStr} 为基准

请直接生成文档内容，无需额外说明。`;

    const response = await this.llmClient.chat({
      model: this.llmClient.getModelId(),
      messages: [{ role: 'user', content: prompt }],
      enableThinking: true,
      temperature: 0.7
    });

    return extractText(response.choices[0].message.content);
  }

  /**
   * 获取当前季节（备用，如需要可移除）
   */
  private getSeason(month: number): string {
    if (month >= 3 && month <= 5) return '春季';
    if (month >= 6 && month <= 8) return '夏季';
    if (month >= 9 && month <= 11) return '秋季';
    return '冬季';
  }

  /**
   * 保存文档
   */
  private async saveDocument(topic: string, content: string): Promise<{ mdPath: string; docxPath: string }> {
    const outputDir = './output';
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    const safeTopic = topic.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_').slice(0, 30);
    const mdPath = path.join(outputDir, `${timestamp}_${safeTopic}.md`);
    const docxPath = path.join(outputDir, `${timestamp}_${safeTopic}.docx`);

    // 保存 Markdown
    fs.writeFileSync(mdPath, content, 'utf-8');
    console.log(`📄 Markdown 已保存: ${mdPath}`);

    // 生成 DOCX
    await this.docxGenerator.generateFromMarkdown(content, docxPath, {
      title: topic,
      createdAt: new Date()
    });
    console.log(`📝 DOCX 已保存: ${docxPath}`);

    return { mdPath, docxPath };
  }
}

export default DocForgeAgent;
