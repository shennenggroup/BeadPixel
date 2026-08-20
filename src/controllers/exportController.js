/**
 * 导出控制器（重构版）
 *
 * 所有导出都基于持久化的【拼豆矩阵 JSON】生成：
 *   POST /api/export/png —— pixel / bead 两种风格，可带网格
 *   POST /api/export/pdf —— 拼豆图纸（编号网格 + 颜色清单）
 *   POST /api/export/csv —— 颜色清单 + 图纸网格
 *
 * 不再从 PNG 反推颜色（旧做法会丢失真实拼豆色号）。
 */

const path = require('path');
const fs = require('fs');
const { renderMatrix } = require('../services/beadRenderer');
const { generateCsv } = require('../services/csvGenerator');
const { loadMatrix, saveMatrix } = require('../services/resultStore');
const PDFGenerator = require('../services/pdfGenerator');

const pdfGenerator = new PDFGenerator();

/** 加载矩阵，失败时返回错误响应 */
function getMatrixOr404(res, resultId) {
  if (!resultId || !/^[a-zA-Z0-9-]+$/.test(String(resultId))) {
    res.status(400).json({ success: false, message: '缺少或非法 resultId 参数' });
    return null;
  }
  const matrix = loadMatrix(resultId);
  if (!matrix) {
    res.status(404).json({ success: false, message: '结果不存在或已过期，请重新生成' });
    return null;
  }
  return matrix;
}

/**
 * 导出 PNG（基于拼豆矩阵渲染）
 */
exports.exportPNG = async (req, res) => {
  try {
    const { resultId, style = 'bead', showGrid = true, showNumbers = false, scale = 14 } = req.body;
    const matrix = getMatrixOr404(res, resultId);
    if (!matrix) return;

    const resultBuffer = await renderMatrix(matrix, {
      style: style === 'pixel' ? 'pixel' : 'bead',
      showGrid: showGrid !== false,
      showNumbers: showNumbers === true,
      scale: Math.max(1, Math.min(40, parseInt(scale, 10) || 14))
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="beadpixel-${resultId}.png"`
    });
    res.send(resultBuffer);
  } catch (err) {
    console.error('导出 PNG 失败:', err);
    res.status(500).json({ success: false, message: '导出失败', error: err.message });
  }
};

/**
 * 导出 PDF（拼豆图纸）
 */
exports.exportPDF = async (req, res) => {
  try {
    const {
      resultId,
      pageSize = 'A4',
      showGrid = true,
      showNumbers = true,
      splitPages = false
    } = req.body;

    const matrix = getMatrixOr404(res, resultId);
    if (!matrix) return;

    const pdfBuffer = await pdfGenerator.generatePDF(matrix, {
      pageSize, showGrid, showNumbers, splitPages
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="beadpixel-${resultId}.pdf"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('导出 PDF 失败:', err);
    res.status(500).json({ success: false, message: '导出失败', error: err.message });
  }
};

/**
 * 导出 CSV（颜色清单 + 图纸网格）
 */
exports.exportCSV = async (req, res) => {
  try {
    const { resultId, includeGrid = true } = req.body;
    const matrix = getMatrixOr404(res, resultId);
    if (!matrix) return;

    const csv = generateCsv(matrix, { includeGrid: includeGrid !== false });

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="beadpixel-${resultId}-colors.csv"`
    });

    // BOM 以支持 Excel 打开中文
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    res.send(Buffer.concat([bom, Buffer.from(csv, 'utf-8')]));
  } catch (err) {
    console.error('导出 CSV 失败:', err);
    res.status(500).json({ success: false, message: '导出失败', error: err.message });
  }
};

/**
 * 获取拼豆矩阵（前端刷新页面后恢复用）
 */
exports.getMatrix = async (req, res) => {
  try {
    const resultId = req.params.resultId;
    const matrix = getMatrixOr404(res, resultId);
    if (!matrix) return;
    res.json({ success: true, resultId, matrix });
  } catch (err) {
    console.error('获取矩阵失败:', err);
    res.status(500).json({ success: false, message: '获取失败', error: err.message });
  }
};

/**
 * 画笔修改：批量更新拼豆格颜色（基于真实色板内已有的编号颜色）
 * body: { changes: [{ x, y, c }] }  c 为 colors[] 的 0 基数组下标
 * 仅更新 cells 与各类颜色 count；保持编号/顺序稳定，避免已改动失效。
 */
exports.updateMatrixCells = async (req, res) => {
  try {
    const resultId = req.params.resultId;
    if (!resultId || !/^[a-zA-Z0-9-]+$/.test(String(resultId))) {
      return res.status(400).json({ success: false, message: '缺少或非法 resultId 参数' });
    }
    const { changes } = req.body || {};
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ success: false, message: '未提供有效的修改列表' });
    }

    const matrix = loadMatrix(resultId);
    if (!matrix) {
      return res.status(404).json({ success: false, message: '结果不存在或已过期，请重新生成' });
    }

    const W = matrix.width;
    const H = matrix.height;
    const nColors = matrix.colors.length;
    let applied = 0;

    for (const ch of changes) {
      const x = ch && ch.x;
      const y = ch && ch.y;
      const c = ch && ch.c;
      if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(c)) continue;
      if (x < 0 || x >= W || y < 0 || y >= H || c < 0 || c >= nColors) continue;
      if (matrix.cells[y][x] === c) continue;
      matrix.cells[y][x] = c;
      applied++;
    }

    if (applied > 0) {
      // 重新统计各颜色数量（保持编号与顺序稳定，不重新排序）
      matrix.colors.forEach(col => { col.count = 0; });
      for (let y = 0; y < H; y++) {
        const row = matrix.cells[y];
        for (let x = 0; x < W; x++) {
          const ci = row[x];
          if (matrix.colors[ci]) matrix.colors[ci].count++;
        }
      }
      saveMatrix(resultId, matrix);
    }

    res.json({
      success: true,
      resultId,
      applied,
      colors: matrix.colors,
      totalBeads: matrix.totalBeads
    });
  } catch (err) {
    console.error('更新矩阵失败:', err);
    res.status(500).json({ success: false, message: '更新失败', error: err.message });
  }
};
