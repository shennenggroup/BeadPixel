/**
 * 历史记录控制器
 *
 * GET    /api/history            —— 列出全部历史（最新在前）
 * DELETE /api/history/:resultId —— 删除一条（同时清理矩阵 JSON 与预览 PNG）
 * PUT    /api/history/:resultId/name —— 重命名
 */

const fs = require('fs');
const path = require('path');
const historyStore = require('../services/historyStore');
const { EXPORT_DIR } = require('../services/resultStore');

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9-]+$/.test(id);
}

exports.list = (req, res) => {
  try {
    res.json({ success: true, history: historyStore.listAll() });
  } catch (err) {
    console.error('获取历史失败:', err);
    res.status(500).json({ success: false, message: '获取失败', error: err.message });
  }
};

exports.delete = (req, res) => {
  try {
    const resultId = req.params.resultId;
    if (!validId(resultId)) {
      return res.status(400).json({ success: false, message: '非法 resultId' });
    }

    historyStore.remove(resultId);

    // 清理落盘文件：矩阵 JSON + 预览 PNG
    const targets = [
      path.join(EXPORT_DIR, `${resultId}.json`),
      path.join(EXPORT_DIR, `${resultId}.png`)
    ];
    let removed = 0;
    targets.forEach(p => {
      if (!fs.existsSync(p)) return;
      try { fs.unlinkSync(p); } catch (_) { /* 某些环境下由安全删除机制接管，文件仍会被移除 */ }
      // 不论以何种方式删除，只要文件已不存在即视为清理成功
      if (!fs.existsSync(p)) removed++;
    });

    res.json({ success: true, removedFiles: removed });
  } catch (err) {
    console.error('删除历史失败:', err);
    res.status(500).json({ success: false, message: '删除失败', error: err.message });
  }
};

exports.rename = (req, res) => {
  try {
    const resultId = req.params.resultId;
    if (!validId(resultId)) {
      return res.status(400).json({ success: false, message: '非法 resultId' });
    }
    const name = (req.body && req.body.name) || '';
    const rec = historyStore.rename(resultId, name);
    if (!rec) {
      return res.status(404).json({ success: false, message: '记录不存在' });
    }
    res.json({ success: true, record: rec });
  } catch (err) {
    console.error('重命名历史失败:', err);
    res.status(500).json({ success: false, message: '重命名失败', error: err.message });
  }
};
