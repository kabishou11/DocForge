/**
 * MCP 工具服务 - 检查 MCP 工具可用性
 *
 * 用于在 TUI 中显示 MCP 工具连接状态
 */

import { getMCPClient } from './mcp-client';

export interface MCPToolsStatus {
  webSearch: boolean;
  webFetch: boolean;
  context7: boolean;
  memory: boolean;
  connected: boolean;
  serverUrl: string;
}

/**
 * MCP 工具服务
 */
export class MCPTools {
  private mcpClient: ReturnType<typeof getMCPClient>;
  private serverUrl: string;

  constructor() {
    this.mcpClient = getMCPClient();
    this.serverUrl = process.env.MCP_SERVER_URL || 'http://localhost:19842';
  }

  /**
   * 尝试连接 MCP 服务器
   */
  async connect(): Promise<boolean> {
    if (this.mcpClient.isConnected(this.serverUrl)) {
      return true;
    }
    return this.mcpClient.connect(this.serverUrl);
  }

  /**
   * 检查 MCP 工具是否可用（自动尝试连接）
   */
  async checkStatus(): Promise<MCPToolsStatus> {
    const status: MCPToolsStatus = {
      webSearch: false,
      webFetch: false,
      context7: false,
      memory: false,
      connected: false,
      serverUrl: this.serverUrl
    };

    // 尝试连接（如果尚未连接）
    const isConnected = await this.connect();
    status.connected = isConnected;

    if (isConnected) {
      // 获取工具列表
      const tools = this.mcpClient.getAllTools();
      const toolNames = tools.map(t => t.name);

      status.webSearch = toolNames.includes('web_search');
      status.webFetch = toolNames.includes('fetch_url') || toolNames.includes('web_fetch');
      status.context7 = toolNames.includes('context7_query') || toolNames.includes('context7');
      status.memory = toolNames.includes('memory_search') || toolNames.includes('memory');
    }

    return status;
  }

  /**
   * 获取工具列表
   */
  async getToolList(): Promise<Array<{ name: string; description: string }>> {
    const status = await this.checkStatus();
    if (!status.connected) {
      return [
        { name: 'web_search', description: '网络搜索' },
        { name: 'fetch_url', description: '网页内容获取' },
        { name: 'get_current_time', description: '获取当前时间' },
        { name: 'calculate_date', description: '日期计算' }
      ];
    }

    return this.mcpClient.getAllTools().map(t => ({
      name: t.name,
      description: t.description || ''
    }));
  }

  /**
   * 获取状态描述
   */
  async getStatusDescription(): Promise<string> {
    const status = await this.checkStatus();
    if (!status.connected) {
      return `❌ 未连接到 MCP 服务器 (${status.serverUrl})`;
    }

    const connected = [];
    const disconnected = [];

    if (status.webSearch) connected.push('WebSearch'); else disconnected.push('WebSearch');
    if (status.webFetch) connected.push('WebFetch'); else disconnected.push('WebFetch');

    return `✅ 已连接到 MCP 服务器\n  已连接: ${connected.join(', ')}`;
  }
}

export default MCPTools;
