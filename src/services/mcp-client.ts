/**
 * MCP Client - Model Context Protocol 客户端
 *
 * 连接 MCP 服务器，调用工具
 *
 * 使用方式：
 * const mcp = new MCPClient();
 * await mcp.connect('http://localhost:3000');
 * const results = await mcp.callTool('web_search', { query: 'AI 发展' });
 */

import { EventEmitter } from 'events';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
  }>;
  isError?: boolean;
}

export interface MCPConnectionInfo {
  url: string;
  tools: MCPTool[];
  connected: boolean;
}

export class MCPClient extends EventEmitter {
  private connections: Map<string, MCPConnectionInfo> = new Map();
  private requestId: number = 0;

  /**
   * 连接到 MCP 服务器
   */
  async connect(serverUrl: string): Promise<boolean> {
    try {
      console.log(`🔗 连接到 MCP 服务器: ${serverUrl}`);

      // 获取服务器能力（工具列表）
      const response = await fetch(`${serverUrl}/tools`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`连接失败: ${response.status}`);
      }

      const tools = await response.json() as MCPTool[];

      this.connections.set(serverUrl, {
        url: serverUrl,
        tools,
        connected: true
      });

      console.log(`✅ 已连接到 ${serverUrl}，可用工具: ${tools.length}`);
      return true;

    } catch (error) {
      console.warn(`⚠️  连接 MCP 服务器失败: ${serverUrl}`, error);
      return false;
    }
  }

  /**
   * 断开连接
   */
  disconnect(serverUrl: string): void {
    this.connections.delete(serverUrl);
    console.log(`🔌 已断开 MCP 服务器: ${serverUrl}`);
  }

  /**
   * 检查是否已连接
   */
  isConnected(serverUrl?: string): boolean {
    if (serverUrl) {
      const conn = this.connections.get(serverUrl);
      return conn?.connected ?? false;
    }
    return this.connections.size > 0;
  }

  /**
   * 获取所有可用工具
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = [];
    for (const conn of this.connections.values()) {
      allTools.push(...conn.tools);
    }
    return allTools;
  }

  /**
   * 获取特定工具
   */
  getTool(name: string): MCPTool | undefined {
    for (const conn of this.connections.values()) {
      const tool = conn.tools.find(t => t.name === name);
      if (tool) return tool;
    }
    return undefined;
  }

  /**
   * 检查工具是否存在
   */
  hasTool(name: string): boolean {
    return this.getTool(name) !== undefined;
  }

  /**
   * 调用工具
  */
  async callTool(serverUrl: string, toolName: string, args: Record<string, any>): Promise<MCPToolResult> {
    const conn = this.connections.get(serverUrl);
    if (!conn) {
      throw new Error(`未连接到服务器: ${serverUrl}`);
    }

    const tool = conn.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`工具不存在: ${toolName}`);
    }

    // 验证必需参数
    if (tool.inputSchema.required) {
      for (const required of tool.inputSchema.required) {
        if (!(required in args)) {
          throw new Error(`缺少必需参数: ${required}`);
        }
      }
    }

    console.log(`🔧 调用工具: ${toolName}`);
    if (Object.keys(args).length > 0) {
      console.log(`   参数: ${JSON.stringify(args)}`);
    }

    try {
      const response = await fetch(`${serverUrl}/tools/${toolName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`工具调用失败: ${error}`);
      }

      const result = await response.json() as MCPToolResult;
      console.log(`✅ 工具调用成功`);
      return result;

    } catch (error) {
      console.error(`❌ 工具调用失败: ${error}`);
      throw error;
    }
  }

  /**
   * 在任意服务器上调用工具（自动查找）
   */
  async callToolAnywhere(toolName: string, args: Record<string, any>): Promise<MCPToolResult | null> {
    // 查找拥有该工具的服务器
    for (const [serverUrl, conn] of this.connections) {
      if (conn.tools.some(t => t.name === toolName)) {
        return this.callTool(serverUrl, toolName, args);
      }
    }
    return null;
  }

  /**
   * 批量调用工具
   */
  async callTools(
    serverUrl: string,
    calls: Array<{ tool: string; args: Record<string, any> }>
  ): Promise<MCPToolResult[]> {
    const results: MCPToolResult[] = [];

    for (const call of calls) {
      try {
        const result = await this.callTool(serverUrl, call.tool, call.args);
        results.push(result);
      } catch (error) {
        results.push({
          content: [{ type: 'text', text: `错误: ${error}` }],
          isError: true
        });
      }
    }

    return results;
  }

  /**
   * 搜索（便捷方法）
   */
  async search(query: string, maxResults: number = 5): Promise<Array<{ title: string; url: string; snippet: string }>> {
    const result = await this.callToolAnywhere('web_search', { query, maxResults });

    if (!result || result.isError) {
      return [];
    }

    // 解析结果
    const text = result.content.map(c => c.text).join('\n');
    try {
      const parsed = JSON.parse(text);
      return parsed.results || parsed;
    } catch {
      return [];
    }
  }

  /**
   * 获取网页（便捷方法）
   */
  async fetch(url: string, maxLength: number = 3000): Promise<string> {
    const result = await this.callToolAnywhere('fetch_url', { url, maxLength });

    if (!result || result.isError) {
      return '';
    }

    return result.content.map(c => c.text).join('\n');
  }

  /**
   * 获取连接状态
   */
  getConnections(): Map<string, MCPConnectionInfo> {
    return this.connections;
  }
}

// 单例实例
let mcpClient: MCPClient | null = null;

export function getMCPClient(): MCPClient {
  if (!mcpClient) {
    mcpClient = new MCPClient();
  }
  return mcpClient;
}

export default MCPClient;
