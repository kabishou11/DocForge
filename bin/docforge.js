/**
 * DocForge CLI - 文档生成命令行工具
 *
 * 使用方法：
 *   docforge              # 启动 TUI 交互界面
 *   docforge init         # 初始化项目配置
 *   docforge style        # 查看/管理风格模板
 *   docforge generate     # 生成文档 (交互式)
 *   docforge tui          # 启动 TUI 界面
 *   docforge models       # 管理模型配置
 */

'use strict';

// 设置环境变量
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

// 检测是否为 TTY 环境 (Windows 下允许运行)
function isInteractive() {
  // 强制允许交互模式，Windows 终端有时 isTTY 检测不准确
  // 但用户主动运行 TUI，应该允许
  return true;
}

/**
 * 显示启动 Logo
 */
function showLogo() {
  console.log(`
    ██╗██╗     ██╗ ██████╗ ███████╗
    ██║██║     ██║██╔═══██╗██╔════╝
    ██║██║     ██║██║   ██║█████╗
    ██║██║     ██║██║   ██║██╔══╝
    ██║███████╗██║╚██████╔╝███████╗
    ╚═╝╚══════╝╚═╝ ╚═════╝ ╚══════╝
    DocForge v0.1
  `);
}

/**
 * 主入口
 */
async function main() {
  const args = process.argv.slice(2);

  // 显示 Logo
  showLogo();

  // 无参数或 --tui 参数时启动 TUI
  if (args.length === 0 || args[0] === '--tui' || args[0] === 'tui') {
    if (!isInteractive()) {
      console.log('非交互模式');
      console.log('使用 --tui 参数启动 TUI 需要终端支持');
      process.exit(0);
    }

    try {
      // 使用编译后的代码
      const { startTui } = require('../dist/tui/index');
      await startTui({});
    } catch (error) {
      // 如果编译后的代码不存在，回退到 ts-node
      try {
        require('ts-node/register');
        const { startTui } = require('../src/tui/index');
        await startTui({});
      } catch (tsError) {
        console.error('TUI 启动失败:', error.message);
        if (error.stack) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    }
    return;
  }

  // 否则使用命令行模式
  require('ts-node/register');
  require('../src/cli');
}

main().catch(console.error);
