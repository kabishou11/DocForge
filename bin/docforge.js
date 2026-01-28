/**
 * 入口脚本 - bin/claude-decode.js
 *
 * 使用 shebang 和 ts-node 执行 TypeScript 源码
 */

#!/usr/bin/env node

/**
 * 设置环境变量
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * 动态导入 ts-node 以支持直接执行 TypeScript
 */
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'ES2020',
    esModuleInterop: true
  }
});

/**
 * 导入并执行 CLI
 */
require('./src/cli');
