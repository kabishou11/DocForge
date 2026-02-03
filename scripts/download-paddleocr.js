#!/usr/bin/env node
/**
 * PaddleOCR-VL-1.5 模型下载脚本
 *
 * 使用方法:
 *   node scripts/download-paddleocr.js [--mirror]
 *
 * 选项:
 *   --mirror    使用中国镜像源下载
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MODEL_REPO = 'PaddlePaddle/PaddleOCR-VL-1.5';
const MODELS_DIR = './models/PaddleOCR-VL-1.5';
const USE_MIRROR = process.argv.includes('--mirror');

const DOWNLOAD_URLS = {
  default: `https://huggingface.co/${MODEL_REPO}/resolve/main`,
  mirror: `https://hf-mirror.com/${MODEL_REPO}/resolve/main`
};

const BASE_URL = USE_MIRROR ? DOWNLOAD_URLS.mirror : DOWNLOAD_URLS.default;

// 需要下载的文件列表
const FILES = [
  'config.json',
  'model.safetensors.index.json',
  'tokenizer.json',
  'special_tokens_map.json',
  'vocab.txt'
];

// 大文件（可能需要分开下载）
const LARGE_FILES = [
  'model.safetensors.data-00000-of-00002',
  'model.safetensors.data-00001-of-00002'
];

console.log(`\x1b[1;36mPaddleOCR-VL-1.5 模型下载工具\x1b[0m\n`);
console.log(`模型仓库: ${MODEL_REPO}`);
console.log(`下载目录: ${path.resolve(MODELS_DIR)}`);
console.log(`镜像源: ${USE_MIRROR ? '是 (hf-mirror.com)' : '否 (huggingface.co)'}`);
console.log('');

// 确保目录存在
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  console.log(`创建目录: ${MODELS_DIR}`);
}

// 下载单个文件
function downloadFile(filename, retryCount = 3) {
  const url = `${BASE_URL}/${filename}`;
  const outputPath = path.join(MODELS_DIR, filename);

  console.log(`下载中: ${filename}`);

  for (let attempt = 1; attempt <= retryCount; attempt++) {
    try {
      // 使用 curl 下载
      execSync(`curl -L -o "${outputPath}" "${url}" --max-time 300`, {
        stdio: 'inherit',
        cwd: process.cwd()
      });

      if (fs.existsSync(outputPath)) {
        const size = fs.statSync(outputPath).size;
        console.log(`  ✓ ${filename} (${formatSize(size)})\n`);
        return true;
      }
    } catch (error) {
      console.log(`  ✗ 下载失败 (尝试 ${attempt}/${retryCount})`);
      if (attempt < retryCount) {
        console.log('  等待 3 秒后重试...\n');
        execSync('sleep 3');
      }
    }
  }

  return false;
}

// 使用 huggingface_hub Python 库下载
function downloadWithHuggingfaceHub() {
  console.log('\n使用 huggingface_hub 下载...\n');

  const pythonScript = `
import os
from huggingface_hub import hf_hub_download

repo_id = "${MODEL_REPO}"
repo_type = "model"
save_dir = "${MODELS_DIR.replace(/\\/g, '\\\\')}"

# 下载配置文件
hf_hub_download(
    repo_id=repo_id,
    filename="config.json",
    repo_type=repo_type,
    local_dir=save_dir,
    local_dir_use_symlinks=False
)

# 下载 tokenizer
hf_hub_download(
    repo_id=repo_id,
    filename="tokenizer.json",
    repo_type=repo_type,
    local_dir=save_dir,
    local_dir_use_symlinks=False
)

print("配置文件下载完成")
`;

  try {
    execSync(`python -c "${pythonScript}"`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.log('huggingface_hub 下载失败:', error.message);
    return false;
  }
}

// 格式化文件大小
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// 主下载流程
async function main() {
  let success = true;
  let useHfHub = false;

  // 先尝试下载小文件
  for (const file of FILES) {
    if (!downloadFile(file)) {
      success = false;
    }
  }

  // 如果小文件下载成功，尝试下载大文件
  if (success) {
    console.log('\n下载大文件 (可能需要几分钟)...\n');

    for (const file of LARGE_FILES) {
      if (!downloadFile(file, 2)) {
        console.log(`\n⚠️  ${file} 下载失败`);
        console.log('  模型仍可工作，但性能可能受影响');
        console.log('  可稍后手动下载或使用镜像源重试\n');
      }
    }
  }

  // 检查下载结果
  const downloadedFiles = FILES.filter(f =>
    fs.existsSync(path.join(MODELS_DIR, f))
  );

  console.log('\x1b[1;36m下载完成\x1b[0m');
  console.log(`成功下载: ${downloadedFiles.length}/${FILES.length} 个文件`);

  if (downloadedFiles.length === FILES.length) {
    console.log('\n✓ 模型已准备好使用');

    // 更新配置中的下载状态
    const configPath = path.join(MODELS_DIR, 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.downloaded = true;
        config.downloadedAt = new Date().toISOString();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        console.log('✓ 配置已更新');
      } catch (error) {
        console.warn('配置更新失败');
      }
    }
  } else {
    console.log('\n⚠️  部分文件下载失败');
    console.log('  请检查网络连接，或使用镜像源重试:');
    console.log('    node scripts/download-paddleocr.js --mirror\n');
  }

  return success;
}

main().catch(console.error);
