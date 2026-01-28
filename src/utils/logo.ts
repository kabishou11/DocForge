/**
 * DocForge Logo - ASCII 艺术字生成
 */

import figlet from 'figlet';
import chalk from 'chalk';

export interface LogoOptions {
  font?: string;
  horizontalLayout?: string;
  verticalLayout?: string;
  color?: string;
}

/**
 * 生成 DocForge Logo
 */
export function generateLogo(options: LogoOptions = {}): string {
  const font = options.font || 'Doom';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hLayout: any = options.horizontalLayout || 'default';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vLayout: any = options.verticalLayout || 'default';

  return figlet.textSync('DocForge', {
    font,
    horizontalLayout: hLayout,
    verticalLayout: vLayout
  });
}

/**
 * 彩色 Logo
 */
export function getColoredLogo(): string {
  const logo = generateLogo({ font: 'Doom' });

  // 对不同字符应用渐变色
  const lines = logo.split('\n');

  return lines.map((line, index) => {
    // 简单的颜色渐变效果
    const hue = (180 + index * 15) % 360;
    return chalk.hex(`hsl(${hue}, 80%, 65%)`)(line);
  }).join('\n');
}

/**
 * 标准 Logo (青色)
 */
export function getStandardLogo(): string {
  const logo = generateLogo({ font: 'Doom' });
  return chalk.cyan(logo);
}

/**
 * 带版本号的 Logo
 */
export function getLogoWithVersion(version: string = 'v0.1'): string {
  const logo = generateLogo({ font: 'Standard' });

  const versionLine = chalk.dim(' '.repeat(20) + version);

  return chalk.cyan(`
${logo}
${versionLine}

${chalk.dim('LLM 驱动的文档生成工具')}
`);
}

/**
 * 迷你 Logo (适合小终端)
 */
export function getMiniLogo(): string {
  return chalk.cyan(`
    ██╗██╗     ██╗ ██████╗ ███████╗
    ██║██║     ██║██╔═══██╗██╔════╝
    ██║██║     ██║██║   ██║█████╗
    ██║██║     ██║██║   ██║██╔══╝
    ██║███████╗██║╚██████╔╝███████╗
    ╚═╝╚══════╝╚═╝ ╚═════╝ ╚══════╝
`) + chalk.dim(' DocForge v0.1\n');
}

/**
 * 所有可用字体
 */
export function getAvailableFonts(): string[] {
  return [
    'Standard',
    'Doom',
    'Small',
    'Big',
    'Bulbhead',
    'Digital',
    'Ghost',
    'Graceful',
    'Lean',
    'Mini',
    'Script',
    'Shadow',
    'Slant',
    'Standard',
    'Univers'
  ];
}

/**
 * 测试不同字体效果
 */
export function testFonts(): string {
  const fonts = ['Standard', 'Doom', 'Slant', 'Shadow', 'Big'];

  return fonts.map(font => {
    const logo = figlet.textSync('Doc', { font });
    return chalk.cyan(`\n[${font}]\n`) + logo;
  }).join('\n');
}

export default {
  generateLogo,
  getColoredLogo,
  getStandardLogo,
  getLogoWithVersion,
  getMiniLogo,
  getAvailableFonts,
  testFonts
};
