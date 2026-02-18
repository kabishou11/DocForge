/**
 * Web Search Service
 * 调用内置 MCP 服务器的 web_search 工具获取最新信息
 */

const MCP_PORT = process.env.MCP_PORT || 19842;
const MCP_BASE = `http://localhost:${MCP_PORT}`;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

/**
 * 搜索网络信息
 */
export async function searchWeb(query: string, maxResults: number = 3): Promise<SearchResult[]> {
  try {
    const response = await fetch(`${MCP_BASE}/tools/web_search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, maxResults }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) return [];

    const data = await response.json() as any;
    // MCP 返回 { content: [{ type: 'text', text: '...' }] }
    const text = data?.content?.[0]?.text || '';
    try {
      const parsed = JSON.parse(text);
      return (parsed.results || []).map((r: any) => ({
        title: r.title || '',
        url: r.url || '',
        snippet: r.snippet || '',
        source: r.source || 'web'
      }));
    } catch {
      return [{ title: query, url: '', snippet: text.slice(0, 500), source: 'raw' }];
    }
  } catch {
    return [];
  }
}

/**
 * 将搜索结果格式化为 LLM 可用的上下文
 */
export function formatSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return '';
  const items = results.map((r, i) =>
    `[${i + 1}] ${r.title}\n${r.snippet}`
  ).join('\n\n');
  return `【参考资料（来自网络搜索）】\n${items}`;
}
