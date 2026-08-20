/**
 * 拼豆矩阵结果存储
 *
 * 拼豆矩阵是所有下游产物（PNG / PDF / CSV / 前端预览）的唯一数据源。
 * 生成后以 JSON 持久化到 exports/<resultId>.json，
 * 导出时直接读取矩阵，不再从 PNG 反推（旧版的做法会丢失真实拼豆编号）。
 */

const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, '..', '..', 'exports');

function ensureDir() {
  if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

function matrixPath(resultId) {
  // 防路径穿越
  if (!/^[a-zA-Z0-9-]+$/.test(resultId)) {
    throw new Error('非法的 resultId');
  }
  return path.join(EXPORT_DIR, `${resultId}.json`);
}

function saveMatrix(resultId, matrix) {
  ensureDir();
  fs.writeFileSync(matrixPath(resultId), JSON.stringify(matrix));
  return matrixPath(resultId);
}

function loadMatrix(resultId) {
  const p = matrixPath(resultId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

module.exports = { saveMatrix, loadMatrix, EXPORT_DIR };
