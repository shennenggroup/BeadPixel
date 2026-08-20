/**
 * 处理控制器（重构版）
 *
 * POST /api/process/pixelate —— 生成拼豆矩阵（保存矩阵 JSON + 预览 PNG）
 * POST /api/process/preview —— 快速预览（base64，同样基于真实矩阵）
 *
 * 参数（前端显示的参数 100% 参与后端生成）：
 *   imageId      - 上传图片 ID
 *   gridWidth    - 拼豆网格宽（格子数）   [兼容旧参数 boardWidth]
 *   gridHeight   - 拼豆网格高（格子数）   [兼容旧参数 boardHeight]
 *   colorLimit   - 'auto' | 'all' | 16/24/32/48/64 最多使用的真实拼豆颜色数
 *   dithering    - 'none' | 'light' | 'standard'
 *   beadBrand    - 'perler' | 'artkal' | 'hama'
 *   fitMode      - 'contain' | 'cover' | 'stretch'
 *   background   - 十六进制背景色
 *   beadSizeMm   - 拼豆物理尺寸（mm），用于图纸实际尺寸
 */

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { BeadEngine } = require('../services/beadEngine');
const { renderMatrix } = require('../services/beadRenderer');
const { saveMatrix } = require('../services/resultStore');
const historyStore = require('../services/historyStore');

const engine = new BeadEngine();

/** 在 uploads 目录中查找 imageId 对应的文件 */
function findImageFile(imageId) {
  if (!imageId || !/^[a-zA-Z0-9-]+$/.test(imageId)) return null;
  const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
  const files = fs.readdirSync(uploadsDir);
  return files.find(f => f.startsWith(imageId)) || null;
}

/** 统一解析请求参数 */
function parseParams(body) {
  const legacy = body.boardWidth || body.boardHeight;
  return {
    gridWidth: body.gridWidth || (legacy ? body.boardWidth : 32),
    gridHeight: body.gridHeight || (legacy ? body.boardHeight : 32),
    colorLimit: body.colorLimit != null ? body.colorLimit : (body.quantizeColors || 'auto'),
    dithering: body.dithering || 'light',
    beadBrand: body.beadBrand || 'perler',
    fitMode: body.fitMode || 'contain',
    background: body.background || '#FFFFFF',
    beadSizeMm: body.beadSizeMm || 5
  };
}

/**
 * 像素化处理（生成拼豆矩阵）
 */
exports.pixelate = async (req, res) => {
  try {
    const { imageId } = req.body;
    if (!imageId) {
      return res.status(400).json({ success: false, message: '缺少 imageId 参数' });
    }

    const imageFile = findImageFile(imageId);
    if (!imageFile) {
      return res.status(404).json({ success: false, message: '图片不存在' });
    }

    const imagePath = path.join(__dirname, '..', '..', 'uploads', imageFile);
    const params = parseParams(req.body);

    // 核心：生成拼豆矩阵
    const matrix = await engine.generate(imagePath, params);

    // 矩阵持久化（导出 PNG/PDF/CSV 的唯一数据源）
    const resultId = uuidv4();
    saveMatrix(resultId, matrix);

    // 预览图（拼豆视觉）
    const previewBuffer = await renderMatrix(matrix, {
      style: 'bead', scale: 12, showGrid: true, maxWidth: 900
    });
    const previewPath = path.join(__dirname, '..', '..', 'exports', `${resultId}.png`);
    fs.writeFileSync(previewPath, previewBuffer);

    // 登记历史记录，供「历史记录」管理（加载/重命名/删除）
    historyStore.add({
      resultId,
      imageId,
      imageUrl: `/uploads/${imageFile}`,
      name: `拼豆图 ${new Date().toLocaleString('zh-CN')}`,
      params: {
        gridWidth: matrix.width,
        gridHeight: matrix.height,
        beadSizeMm: matrix.meta.beadSizeMm,
        colorLimit: matrix.meta.colorLimit,
        dithering: matrix.meta.dithering,
        fitMode: matrix.meta.fitMode,
        beadBrand: matrix.meta.brand,
        detailPriority: matrix.meta.detailPriority,
        background: params.background
      },
      meta: {
        width: matrix.width,
        height: matrix.height,
        colorCount: matrix.colors.length,
        totalBeads: matrix.totalBeads,
        physicalWidthCm: matrix.meta.physicalWidthCm,
        physicalHeightCm: matrix.meta.physicalHeightCm,
        brandName: matrix.meta.brandName
      },
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      resultId,
      previewUrl: `/exports/${resultId}.png`,
      width: matrix.width,
      height: matrix.height,
      colorCount: matrix.colors.length,
      totalBeads: matrix.totalBeads,
      beadColors: matrix.colors,
      meta: matrix.meta,
      matrix
    });
  } catch (err) {
    console.error('处理失败:', err);
    res.status(500).json({ success: false, message: '处理失败', error: err.message });
  }
};

/**
 * 快速预览（返回 base64）
 */
exports.preview = async (req, res) => {
  try {
    const { imageId } = req.body;
    if (!imageId) {
      return res.status(400).json({ success: false, message: '缺少 imageId 参数' });
    }

    const imageFile = findImageFile(imageId);
    if (!imageFile) {
      return res.status(404).json({ success: false, message: '图片不存在' });
    }

    const imagePath = path.join(__dirname, '..', '..', 'uploads', imageFile);
    const params = parseParams(req.body);

    const matrix = await engine.generate(imagePath, params);
    const buffer = await renderMatrix(matrix, {
      style: 'bead', scale: 12, showGrid: true, maxWidth: 720
    });

    res.json({
      success: true,
      image: `data:image/png;base64,${buffer.toString('base64')}`,
      width: matrix.width,
      height: matrix.height,
      colorCount: matrix.colors.length,
      totalBeads: matrix.totalBeads,
      beadColors: matrix.colors,
      meta: matrix.meta,
      matrix
    });
  } catch (err) {
    console.error('预览失败:', err);
    res.status(500).json({ success: false, message: '预览失败', error: err.message });
  }
};
