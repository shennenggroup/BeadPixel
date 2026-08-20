const fs = require('fs');
const path = require('path');

/**
 * 确保目录存在
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 清理旧文件（超过指定时间的文件）
 */
function cleanupOldFiles(dirPath, maxAgeMs) {
  if (!fs.existsSync(dirPath)) return;

  const files = fs.readdirSync(dirPath);
  const now = Date.now();

  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);

    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = {
  ensureDir,
  cleanupOldFiles
};
