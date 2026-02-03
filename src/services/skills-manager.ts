/**
 * Skills 下载和管理服务
 *
 * 支持从 GitHub 下载 Skills，类似 Claude Code 的 skill 系统
 * 存储位置: .docforge/skills/
 */

import * as fs from 'fs';
import * as path from 'path';
import { URL } from 'url';

export interface SkillInfo {
  name: string;
  description: string;
  location: string;
  source: 'builtin' | 'downloaded' | 'local';
  url?: string;
}

export interface SkillDownloadResult {
  success: boolean;
  skill?: SkillInfo;
  error?: string;
}

// 默认 Skills 仓库
const DEFAULT_SKILLS_REPOS = [
  { owner: 'anthropic', repo: 'claude-code-skills', path: 'skills' },
  // 可以添加更多仓库
];

/**
 * Skills 管理器
 */
export class SkillsManager {
  private skillsDir: string;
  private skillsCache: Map<string, SkillInfo> = new Map();

  constructor() {
    this.skillsDir = './.docforge/skills';
  }

  /**
   * 确保 skills 目录存在
   */
  private ensureDir(): void {
    if (!fs.existsSync(this.skillsDir)) {
      fs.mkdirSync(this.skillsDir, { recursive: true });
    }
  }

  /**
   * 获取所有已安装的 Skills
   */
  async getInstalledSkills(): Promise<SkillInfo[]> {
    this.ensureDir();
    const skills: SkillInfo[] = [];

    // 扫描 .docforge/skills/ 目录
    const entries = fs.readdirSync(this.skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(this.skillsDir, entry.name);
        const skillFile = path.join(skillPath, 'SKILL.json');
        const readmeFile = path.join(skillPath, 'README.md');

        if (fs.existsSync(skillFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(skillFile, 'utf-8'));
            skills.push({
              name: data.name || entry.name,
              description: data.description || '无描述',
              location: skillPath,
              source: 'downloaded'
            });
          } catch {
            // 忽略解析错误的文件
          }
        } else if (fs.existsSync(readmeFile)) {
          // 从 README.md 提取信息
          const content = fs.readFileSync(readmeFile, 'utf-8');
          const nameMatch = content.match(/#\s+(.+)/);
          const descMatch = content.match(/##\s+描述\n(.+)/) || content.match(/##\s+Description\n(.+)/);
          skills.push({
            name: nameMatch?.[1]?.trim() || entry.name,
            description: descMatch?.[1]?.trim() || '无描述',
            location: skillPath,
            source: 'downloaded'
          });
        }
      }
    }

    return skills;
  }

  /**
   * 从 GitHub 下载 Skill
   */
  async downloadSkill(repo: { owner: string; repo: string; path: string }, skillName: string): Promise<SkillDownloadResult> {
    this.ensureDir();

    const skillDir = path.join(this.skillsDir, skillName);

    // 检查是否已存在
    if (fs.existsSync(skillDir)) {
      return {
        success: false,
        error: `Skill "${skillName}" 已存在`
      };
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });

      // 下载 SKILL.json
      const skillJsonUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/${repo.path}/${skillName}/SKILL.json`;
      const skillResponse = await fetch(skillJsonUrl, { signal: AbortSignal.timeout(10000) });

      if (skillResponse.ok) {
        const skillJson = await skillResponse.text();
        fs.writeFileSync(path.join(skillDir, 'SKILL.json'), skillJson);
      }

      // 下载 README.md
      const readmeUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/${repo.path}/${skillName}/README.md`;
      const readmeResponse = await fetch(readmeUrl, { signal: AbortSignal.timeout(10000) });

      if (readmeResponse.ok) {
        const readme = await readmeResponse.text();
        fs.writeFileSync(path.join(skillDir, 'README.md'), readme);
      }

      // 下载执行脚本 (如果有)
      const scriptUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/${repo.path}/${skillName}/index.js`;
      const scriptResponse = await fetch(scriptUrl, { signal: AbortSignal.timeout(10000) });

      if (scriptResponse.ok) {
        const script = await scriptResponse.text();
        fs.writeFileSync(path.join(skillDir, 'index.js'), script);
      }

      return {
        success: true,
        skill: {
          name: skillName,
          description: '已下载',
          location: skillDir,
          source: 'downloaded',
          url: `https://github.com/${repo.owner}/${repo.repo}`
        }
      };

    } catch (error) {
      // 清理失败的下载
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
      }
      return {
        success: false,
        error: String(error)
      };
    }
  }

  /**
   * 列出远程仓库中的 Skills
   */
  async listRemoteSkills(repo: { owner: string; repo: string; path: string }): Promise<Array<{ name: string; description: string }>> {
    try {
      // 获取目录内容
      const apiUrl = `https://api.github.com/repos/${repo.owner}/${repo.repo}/contents/${repo.path}`;
      const response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json() as Array<{ name: string; type: string }>;
      const skills: Array<{ name: string; description: string }> = [];

      for (const item of data) {
        if (item.type === 'dir') {
          // 获取每个 skill 的描述
          const skillJsonUrl = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/main/${repo.path}/${item.name}/SKILL.json`;
          try {
            const skillResponse = await fetch(skillJsonUrl, { signal: AbortSignal.timeout(5000) });
            if (skillResponse.ok) {
              const skillData = JSON.parse(await skillResponse.text());
              skills.push({
                name: item.name,
                description: skillData.description || '无描述'
              });
            } else {
              skills.push({
                name: item.name,
                description: '点击下载获取详情'
              });
            }
          } catch {
            skills.push({
              name: item.name,
              description: '点击下载获取详情'
            });
          }
        }
      }

      return skills;

    } catch {
      return [];
    }
  }

  /**
   * 删除已安装的 Skill
   */
  async deleteSkill(skillName: string): Promise<boolean> {
    const skillDir = path.join(this.skillsDir, skillName);
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true });
      return true;
    }
    return false;
  }

  /**
   * 获取 skills 目录路径
   */
  getSkillsDirectory(): string {
    return this.skillsDir;
  }
}

export default SkillsManager;
