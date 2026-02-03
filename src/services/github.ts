/**
 * GitHub 服务 - 封装 GitHub API 操作
 */

import * as fs from 'fs';
import * as path from 'path';

export interface GitHubConfig {
  owner: string;
  repo: string;
  branch: string;
  token?: string;
}

export interface GitHubFile {
  path: string;
  content: string;
  sha?: string;
}

export interface CommitInfo {
  message: string;
  author?: string;
  files: GitHubFile[];
}

/**
 * GitHub 服务类
 */
export class GitHubService {
  private config: GitHubConfig;
  private baseUrl: string;

  constructor(config: GitHubConfig) {
    this.config = config;
    this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
  }

  /**
   * 获取配置
   */
  getConfig(): GitHubConfig {
    return this.config;
  }

  /**
   * 设置 token
   */
  setToken(token: string): void {
    this.config.token = token;
  }

  /**
   * 检查是否已配置 token
   */
  hasToken(): boolean {
    return !!this.config.token;
  }

  /**
   * 发送 GitHub API 请求
   */
  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'DocForge',
      ...(options.headers as Record<string, string>),
    };

    if (this.config.token) {
      headers['Authorization'] = `token ${this.config.token}`;
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitHub API Error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * 获取仓库信息
   */
  async getRepo(): Promise<any> {
    return this.request('');
  }

  /**
   * 获取分支信息
   */
  async getBranch(branch?: string): Promise<any> {
    return this.request(`/branches/${branch || this.config.branch}`);
  }

  /**
   * 获取文件的 SHA
   */
  async getFileSha(path: string): Promise<string | null> {
    try {
      const response = await this.request(`/contents/${path}`);
      return response.sha;
    } catch {
      return null;
    }
  }

  /**
   * 获取文件内容
   */
  async getFile(path: string): Promise<string | null> {
    try {
      const response = await this.request(`/contents/${path}`);
      if (response.content) {
        return Buffer.from(response.content, 'base64').toString('utf-8');
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 创建或更新文件
   */
  async saveFile(filePath: string, content: string, message: string): Promise<any> {
    const sha = await this.getFileSha(filePath);

    const body: any = {
      message,
      content: Buffer.from(content).toString('base64'),
    };

    if (sha) {
      body.sha = sha;
    }

    return this.request(`/contents/${filePath}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  /**
   * 批量提交文件
   */
  async commitFiles(commitInfo: CommitInfo): Promise<any> {
    const results = [];

    for (const file of commitInfo.files) {
      try {
        const result = await this.saveFile(file.path, file.content, commitInfo.message);
        results.push({ path: file.path, success: true, result });
      } catch (error) {
        results.push({
          path: file.path,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return results;
  }

  /**
   * 创建分支
   */
  async createBranch(branchName: string, fromBranch?: string): Promise<any> {
    // 获取源分支的 SHA
    const sourceBranch = fromBranch || this.config.branch;
    const branchRef = await this.request(`/git/refs/heads/${sourceBranch}`);

    // 创建新分支
    return this.request('/git/refs', {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${branchName}`,
        sha: branchRef.object.sha,
      }),
    });
  }

  /**
   * 创建 Pull Request
   */
  async createPR(title: string, body: string, head: string, base: string): Promise<any> {
    return this.request('/pulls', {
      method: 'POST',
      body: JSON.stringify({ title, body, head, base }),
    });
  }
}

/**
 * 从配置文件加载 GitHub 配置
 */
export function loadGitHubConfig(configPath: string = './.docforgerc'): GitHubConfig | null {
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return {
      owner: config.github?.owner || '',
      repo: config.github?.repo || '',
      branch: config.github?.branch || 'main',
      token: process.env.GITHUB_TOKEN,
    };
  } catch {
    return null;
  }
}

export default GitHubService;
