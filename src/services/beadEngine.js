/**
 * 拼豆核心引擎
 *
 * 完整流水线：
 *
 *   原图
 *    → 预处理（Alpha 展平 / 限制工作分辨率）
 *    → 拼豆网格采样（每个格子 = 一颗拼豆，绝不因宽高比偷偷改网格）
 *        · 区域平均色（平滑区，抗噪）
 *        · 中心加权色（保护居中小特征：眼睛、高光）
 *        · 主导色（保护穿过格子的轮廓线、描边）
 *        · Sobel 边缘能量 + 局部对比度 → 细节权重
 *    → 真实色板最近邻匹配（CIEDE2000）
 *    → 颜色数量裁剪（从真实色板选 N 色，细节优先加权）
 *    → 真实色板抖动（Floyd-Steinberg，误差在拼豆格子间传播，
 *      目标色重新从真实色板选择；轻度模式抑制噪点并保护细节格）
 *    → 拼豆矩阵（结构化数据，后续渲染/图纸/CSV 全部基于它）
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { PaletteMatcher } = require('./beadMapper');
const { reducePalette } = require('./colorQuantizer');
const { luminance } = require('../utils/colorUtils');

// ---------- 常量 ----------

const MAX_WORKING_PIXELS = 3.5 * 1024 * 1024; // 工作图最大像素，防止大图内存爆炸
const MAX_GRID = 250;      // 最大网格边长（拼豆格）
const MIN_GRID = 8;        // 最小网格边长
const CELL_SAMPLES_MIN = 6;
const CELL_SAMPLES_MAX = 24;

// 采样策略阈值（作用于全图归一化后的细节能量 0~1）
const DETAIL_FLAT_THRESHOLD = 0.12; // 低于该值 → 平滑区，用区域平均
const DOMINANT_FRACTION = 0.5;      // 主导色占比超过该值 → 用主导色（保护轮廓）

// 抖动
const DITHER_STRENGTH = { none: 0, light: 0.45, standard: 1.0 };
const DETAIL_PROTECT_THRESHOLD = 0.55; // 高细节格的误差注入衰减

const BRANDS = ['perler', 'artkal', 'hama'];

// ---------- 色板加载（进程级缓存） ----------

const _paletteCache = new Map();

function loadPalette(brand) {
  if (!BRANDS.includes(brand)) {
    throw new Error(`不支持的拼豆品牌: ${brand}，可选: ${BRANDS.join(', ')}`);
  }
  if (!_paletteCache.has(brand)) {
    const filePath = path.join(__dirname, '..', 'data', 'beadColors', `${brand}.json`);
    _paletteCache.set(brand, JSON.parse(fs.readFileSync(filePath, 'utf-8')));
  }
  return _paletteCache.get(brand);
}

// ---------- 工具 ----------

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function parseColorLimit(raw) {
  if (raw === 'auto' || raw === 0 || raw === '0' || raw == null) return 'auto';
  if (raw === 'all' || raw === 'full') return Infinity;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n) || n <= 0) return 'auto';
  return n;
}

function percentile(arr, p) {
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[idx];
}

function hexToRgbTuple(hex) {
  const v = hex.replace('#', '');
  return [
    parseInt(v.substring(0, 2), 16) || 0,
    parseInt(v.substring(2, 4), 16) || 0,
    parseInt(v.substring(4, 6), 16) || 0
  ];
}

function brandDisplayName(brand) {
  return { perler: 'Perler', artkal: 'Artkal', hama: 'Hama' }[brand] || brand;
}

// ---------- 引擎 ----------

class BeadEngine {
  /**
   * 生成拼豆矩阵
   * @param {string} imagePath - 图片路径
   * @param {Object} options
   * @param {number} options.gridWidth  - 拼豆网格宽（格子数，即拼豆数）
   * @param {number} options.gridHeight - 拼豆网格高
   * @param {string|number} options.colorLimit - 'auto' | 'all' | 16/24/32/48/64...
   * @param {string} options.dithering  - 'none' | 'light' | 'standard'
   * @param {string} options.beadBrand  - 'perler' | 'artkal' | 'hama'
   * @param {string} options.fitMode    - 'contain'(保持比例留白) | 'cover'(裁剪填满) | 'stretch'(拉伸)
   * @param {string} options.background - 十六进制背景色（contain 模式留白用），默认白色
   * @param {boolean} options.detailPriority - 细节优先（颜色裁剪时保护高细节格）
   * @param {number} options.beadSizeMm - 拼豆物理尺寸（mm），用于图纸实际尺寸
   */
  async generate(imagePath, options = {}) {
    const gridWidth = clamp(Math.round(options.gridWidth || 32), MIN_GRID, MAX_GRID);
    const gridHeight = clamp(Math.round(options.gridHeight || 32), MIN_GRID, MAX_GRID);
    const colorLimit = parseColorLimit(options.colorLimit != null ? options.colorLimit : 'auto');
    const dithering = ['none', 'light', 'standard'].includes(options.dithering)
      ? options.dithering : 'light';
    const fitMode = ['contain', 'cover', 'stretch'].includes(options.fitMode)
      ? options.fitMode : 'contain';
    const detailPriority = options.detailPriority !== false;
    const beadSizeMm = clamp(parseFloat(options.beadSizeMm) || 5, 2, 10);
    const background = /^#[0-9a-fA-F]{6}$/.test(options.background || '')
      ? options.background : '#FFFFFF';

    const palette = loadPalette(options.beadBrand || 'perler');
    const matcher = new PaletteMatcher(palette);

    // ---------- 1. 预处理 + 网格对齐的工作图 ----------
    // 每个格子分配 s×s 个采样像素；工作图尺寸严格等于网格 × s，
    // 因此最终拼豆矩阵严格等于用户指定的 gridWidth × gridHeight。
    let s = Math.round(Math.sqrt(MAX_WORKING_PIXELS / (gridWidth * gridHeight)));
    s = clamp(s, CELL_SAMPLES_MIN, CELL_SAMPLES_MAX);
    const workW = gridWidth * s;
    const workH = gridHeight * s;

    const bg = hexToRgbTuple(background);
    const resizeOpts = {
      width: workW,
      height: workH,
      fit: fitMode === 'cover' ? 'cover' : (fitMode === 'stretch' ? 'fill' : 'contain'),
      background: { r: bg[0], g: bg[1], b: bg[2], alpha: 1 },
      kernel: 'lanczos3'
    };
    if (fitMode === 'cover') resizeOpts.position = sharp.strategy.attention; // 注意力裁剪，尽量保主体

    const srcMeta = await sharp(imagePath).metadata();
    const { data } = await sharp(imagePath)
      .resize(resizeOpts)
      .flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // ---------- 2. Sobel 边缘能量图 ----------
    const edge = computeSobel(data, workW, workH);

    // ---------- 3. 逐格采样（统计特征，先不做决策） ----------
    const stats = sampleCells(data, edge, workW, workH, s, gridWidth, gridHeight);

    // ---------- 4. 细节归一化 + 智能目标色决策 ----------
    const cellCount = gridWidth * gridHeight;
    const targetR = new Float32Array(cellCount);
    const targetG = new Float32Array(cellCount);
    const targetB = new Float32Array(cellCount);
    const importance = new Float32Array(cellCount);

    // 边缘能量归一化基准（全图 95 分位），细节能量 0~1
    const p95 = percentile(stats.energy, 0.95) || 1;

    for (let i = 0; i < cellCount; i++) {
      const detail = clamp(stats.energy[i] / p95, 0, 1);
      importance[i] = detail;

      if (detail < DETAIL_FLAT_THRESHOLD) {
        // 平滑区：区域平均色 —— 过渡自然、抗噪
        targetR[i] = stats.meanR[i]; targetG[i] = stats.meanG[i]; targetB[i] = stats.meanB[i];
      } else if (stats.domFraction[i] >= DOMINANT_FRACTION) {
        // 高细节 + 强主导色：保留轮廓线 / 描边 / 纯色块
        targetR[i] = stats.domR[i]; targetG[i] = stats.domG[i]; targetB[i] = stats.domB[i];
      } else {
        // 高细节 + 混合区：中心加权（保护落在格子中心的小特征，如眼睛）
        targetR[i] = stats.weightedR[i]; targetG[i] = stats.weightedG[i]; targetB[i] = stats.weightedB[i];
      }
      targetR[i] = clamp(Math.round(targetR[i]), 0, 255);
      targetG[i] = clamp(Math.round(targetG[i]), 0, 255);
      targetB[i] = clamp(Math.round(targetB[i]), 0, 255);
    }

    // ---------- 5. 全色板最近邻 + 加权使用统计 ----------
    const usage = new Map(); // 色板索引 -> 加权使用量
    const fullMatch = new Int32Array(cellCount);
    for (let i = 0; i < cellCount; i++) {
      const idx = matcher.matchIndex(targetR[i], targetG[i], targetB[i]);
      fullMatch[i] = idx;
      // 细节优先：高细节格的颜色在色板裁剪时权重更高，避免主体颜色被合并
      const w = 1 + (detailPriority ? 2.0 * importance[i] : 0);
      usage.set(idx, (usage.get(idx) || 0) + w);
    }

    // ---------- 6. 颜色数量裁剪（真实色板 N 选一） ----------
    const paletteLabs = matcher.palette.map(c => c.lab);
    const limit = colorLimit === 'auto' ? 'auto'
      : (colorLimit === Infinity ? matcher.size : colorLimit);
    const mapping = reducePalette(usage, paletteLabs, limit);

    const survivorSet = new Set();
    for (const [, v] of mapping) survivorSet.add(v);
    if (survivorSet.size === 0) survivorSet.add(fullMatch[0]);

    // 子色板匹配器（后续所有匹配都在"被选中的真实拼豆颜色"中进行）
    const survivors = Array.from(survivorSet).sort((a, b) => a - b)
      .map(i => matcher.palette[i]);
    const reducedMatcher = new PaletteMatcher(survivors);

    // ---------- 7. 真实色板抖动 + 最终颜色分配 ----------
    const cells = ditherAssign({
      targetR, targetG, targetB, importance,
      gridWidth, gridHeight,
      matcher: reducedMatcher,
      strength: DITHER_STRENGTH[dithering]
    });

    // ---------- 8. 构建拼豆矩阵 ----------
    return buildMatrix(cells, gridWidth, gridHeight, survivors, {
      brand: options.beadBrand || 'perler',
      brandName: brandDisplayName(options.beadBrand || 'perler'),
      colorLimit: colorLimit === Infinity ? 'all' : (colorLimit === 'auto' ? 'auto' : colorLimit),
      dithering,
      fitMode,
      detailPriority,
      beadSizeMm,
      sourceWidth: srcMeta.width,
      sourceHeight: srcMeta.height,
      workingScale: s
    });
  }
}

// ---------- 采样实现 ----------

/**
 * 对每个拼豆格子做区域采样，返回统计特征数组：
 *  meanR/G/B      - 区域平均色（平滑区用）
 *  weightedR/G/B  - 中心加权平均色（高细节混合区用）
 *  domR/G/B       - 主导色（4bit/通道直方图的众数桶平均色）
 *  domFraction    - 主导色占比 0~1
 *  energy         - 细节能量 = Sobel 均值 + 局部对比度（未归一化）
 */
function sampleCells(data, edge, workW, workH, s, gridWidth, gridHeight) {
  const cellCount = gridWidth * gridHeight;
  const out = {
    meanR: new Float32Array(cellCount), meanG: new Float32Array(cellCount), meanB: new Float32Array(cellCount),
    weightedR: new Float32Array(cellCount), weightedG: new Float32Array(cellCount), weightedB: new Float32Array(cellCount),
    domR: new Float32Array(cellCount), domG: new Float32Array(cellCount), domB: new Float32Array(cellCount),
    domFraction: new Float32Array(cellCount),
    energy: new Float32Array(cellCount)
  };

  const centerMin = Math.floor(s * 0.30);
  const centerMax = s - centerMin;

  for (let gy = 0; gy < gridHeight; gy++) {
    for (let gx = 0; gx < gridWidth; gx++) {
      const cellIdx = gy * gridWidth + gx;
      const x0 = gx * s;
      const y0 = gy * s;

      let sumR = 0, sumG = 0, sumB = 0, n = 0;
      let wSumR = 0, wSumG = 0, wSumB = 0, wTotal = 0;
      let edgeSum = 0;
      let minL = 255, maxL = 0;

      // 主导色直方图（4bit/通道，4096 桶；记录桶内累加值以还原平均色）
      const buckets = new Map();

      for (let dy = 0; dy < s; dy++) {
        const py = y0 + dy;
        if (py >= workH) break;
        const rowOff = py * workW;
        for (let dx = 0; dx < s; dx++) {
          const px = x0 + dx;
          if (px >= workW) break;
          const p = (rowOff + px) * 3;
          const r = data[p], g = data[p + 1], b = data[p + 2];

          sumR += r; sumG += g; sumB += b; n++;

          const inCenter = dx >= centerMin && dx < centerMax && dy >= centerMin && dy < centerMax;
          const w = inCenter ? 4 : 1;
          wSumR += r * w; wSumG += g * w; wSumB += b * w; wTotal += w;

          const bucketKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
          let bk = buckets.get(bucketKey);
          if (!bk) { bk = { r: 0, g: 0, b: 0, count: 0 }; buckets.set(bucketKey, bk); }
          bk.r += r; bk.g += g; bk.b += b; bk.count++;

          edgeSum += edge[rowOff + px];

          const lum = luminance(r, g, b);
          if (lum < minL) minL = lum;
          if (lum > maxL) maxL = lum;
        }
      }

      if (n === 0) { // 理论上不会发生（工作图严格按网格生成）
        out.meanR[cellIdx] = out.meanG[cellIdx] = out.meanB[cellIdx] = 255;
        out.energy[cellIdx] = 0;
        continue;
      }

      // 主导色（众数桶的平均色）
      let domR = 0, domG = 0, domB = 0, domCount = 0;
      for (const bk of buckets.values()) {
        if (bk.count > domCount) {
          domCount = bk.count;
          domR = bk.r / bk.count; domG = bk.g / bk.count; domB = bk.b / bk.count;
        }
      }

      out.meanR[cellIdx] = sumR / n;
      out.meanG[cellIdx] = sumG / n;
      out.meanB[cellIdx] = sumB / n;
      out.weightedR[cellIdx] = wSumR / wTotal;
      out.weightedG[cellIdx] = wSumG / wTotal;
      out.weightedB[cellIdx] = wSumB / wTotal;
      out.domR[cellIdx] = domR;
      out.domG[cellIdx] = domG;
      out.domB[cellIdx] = domB;
      out.domFraction[cellIdx] = domCount / n;

      // 细节能量 = Sobel 均值（0~255 → 0~1）+ 局部对比度贡献
      const edgeMean = edgeSum / n;
      const contrast = (maxL - minL) / 255;
      out.energy[cellIdx] = edgeMean / 255 + contrast * 0.35;
    }
  }
  return out;
}

/** Sobel 边缘幅值（近似 |gx|+|gy|），输出 0~255 灰度强度 */
function computeSobel(data, w, h) {
  const lum = new Float32Array(w * h);
  for (let i = 0, p = 0; i < lum.length; i++, p += 3) {
    lum[i] = luminance(data[p], data[p + 1], data[p + 2]);
  }
  const edge = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1]
        + lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy = -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1]
        + lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      edge[i] = Math.min(255, Math.abs(gx) + Math.abs(gy));
    }
  }
  return edge;
}

// ---------- 抖动实现 ----------

/**
 * 真实色板 Floyd-Steinberg 抖动（蛇形扫描）。
 * - 误差在【拼豆格子】之间传播；
 * - 每个格子（含收到误差后的目标色）都重新从【真实拼豆子色板】中选择颜色；
 * - 轻度模式：误差强度 45%，且高细节格基本不接收误差（防止轮廓被噪点污染）；
 * - 无抖动：直接最近邻。
 *
 * @returns {Int32Array} 每格的子色板索引
 */
function ditherAssign({ targetR, targetG, targetB, importance, gridWidth, gridHeight, matcher, strength }) {
  const total = gridWidth * gridHeight;
  const result = new Int32Array(total);

  if (strength <= 0) {
    for (let i = 0; i < total; i++) {
      result[i] = matcher.matchIndex(targetR[i], targetG[i], targetB[i]);
    }
    return result;
  }

  // 累积误差缓冲（目标色 + 误差后再匹配）
  const bufR = new Float32Array(total);
  const bufG = new Float32Array(total);
  const bufB = new Float32Array(total);

  const pushError = (x, y, er, eg, eb, f) => {
    if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return;
    const i = y * gridWidth + x;
    bufR[i] += er * f;
    bufG[i] += eg * f;
    bufB[i] += eb * f;
  };

  for (let y = 0; y < gridHeight; y++) {
    const leftToRight = (y % 2) === 0;
    for (let k = 0; k < gridWidth; k++) {
      const x = leftToRight ? k : (gridWidth - 1 - k);
      const i = y * gridWidth + x;

      // 高细节格抑制接收误差（保护轮廓/五官/文字）
      const protect = importance[i] > DETAIL_PROTECT_THRESHOLD ? 0.15 : 1.0;
      const tr = clamp(targetR[i] + bufR[i] * protect, 0, 255);
      const tg = clamp(targetG[i] + bufG[i] * protect, 0, 255);
      const tb = clamp(targetB[i] + bufB[i] * protect, 0, 255);

      const idx = matcher.matchIndex(Math.round(tr), Math.round(tg), Math.round(tb));
      result[i] = idx;
      const chosen = matcher.get(idx);

      const er = (tr - chosen.rgb[0]) * strength;
      const eg = (tg - chosen.rgb[1]) * strength;
      const eb = (tb - chosen.rgb[2]) * strength;

      // FS 核（按扫描方向镜像）
      const dx = leftToRight ? 1 : -1;
      pushError(x + dx, y, er, eg, eb, 7 / 16);
      pushError(x - dx, y + 1, er, eg, eb, 3 / 16);
      pushError(x, y + 1, er, eg, eb, 5 / 16);
      pushError(x + dx, y + 1, er, eg, eb, 1 / 16);
    }
  }
  return result;
}

// ---------- 矩阵构建 ----------

function buildMatrix(cells, gridWidth, gridHeight, survivors, meta) {
  // 统计每种颜色使用数
  const counts = new Uint32Array(survivors.length);
  for (let i = 0; i < cells.length; i++) counts[cells[i]]++;

  // 按使用数量降序编号（编号从 1 开始，用于图纸）
  const order = Array.from(counts.keys())
    .filter(i => counts[i] > 0)
    .sort((a, b) => counts[b] - counts[a]);

  const remap = new Int32Array(survivors.length);
  const colors = order.map((survivorIdx, displayIdx) => {
    remap[survivorIdx] = displayIdx;
    const c = survivors[survivorIdx];
    return {
      index: displayIdx + 1,           // 图纸编号 1..N
      code: c.code,
      name: c.name,
      hex: c.hex,
      rgb: c.rgb,
      count: counts[survivorIdx]
    };
  });

  // cells: 二维 [y][x] -> colors 数组下标（0 基，与 colors[] 对齐）
  const cellMatrix = [];
  for (let y = 0; y < gridHeight; y++) {
    const row = new Array(gridWidth);
    for (let x = 0; x < gridWidth; x++) {
      row[x] = remap[cells[y * gridWidth + x]];
    }
    cellMatrix.push(row);
  }

  const totalBeads = gridWidth * gridHeight;
  return {
    version: 2,
    width: gridWidth,
    height: gridHeight,
    cells: cellMatrix,
    colors,
    totalBeads,
    meta: {
      ...meta,
      colorCount: colors.length,
      physicalWidthCm: +(gridWidth * meta.beadSizeMm / 10).toFixed(1),
      physicalHeightCm: +(gridHeight * meta.beadSizeMm / 10).toFixed(1),
      generatedAt: new Date().toISOString()
    }
  };
}

module.exports = { BeadEngine, loadPalette, BRANDS };
