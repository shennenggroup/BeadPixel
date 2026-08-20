/**
 * 拼豆色板匹配服务
 *
 * 核心职责：给定任意 RGB 目标色，在【真实拼豆色板】中找到
 * CIEDE2000 色差最小的拼豆颜色。
 *
 * 性能设计（避免每像素 × 每色板的 O(N*M) 重复计算）：
 * 1. 色板 Lab 值只计算一次；
 * 2. 用"快速 Lab 平方距离"预筛选出前 K 个候选，再对候选做
 *    精确 CIEDE2000 —— 结果与全量 CIEDE2000 几乎一致，但快一个数量级；
 * 3. 目标色 -> 色板索引 的结果按 RGB 值缓存（同一图片内大量重复色）。
 */

const { cachedLab, ciede2000, labDistance } = require('../utils/colorUtils');

const CANDIDATE_K = 8; // 预筛选候选数量

class PaletteMatcher {
  /**
   * @param {Array} beadPalette - [{code, name, hex, rgb:[r,g,b]}, ...]
   */
  constructor(beadPalette) {
    if (!Array.isArray(beadPalette) || beadPalette.length === 0) {
      throw new Error('色板不能为空');
    }
    this.palette = beadPalette.map((c, i) => ({
      index: i,
      code: c.code,
      name: c.name,
      hex: c.hex,
      rgb: c.rgb,
      lab: cachedLab(c.rgb[0], c.rgb[1], c.rgb[2])
    }));
    this._matchCache = new Map(); // packedRgb -> palette index
  }

  get size() {
    return this.palette.length;
  }

  get(index) {
    return this.palette[index];
  }

  /**
   * 找到与目标 RGB 最接近的拼豆颜色索引（CIEDE2000）
   * @returns {number} 色板索引
   */
  matchIndex(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    const cached = this._matchCache.get(key);
    if (cached !== undefined) return cached;

    const targetLab = cachedLab(r, g, b);

    // 第一步：快速 Lab 平方距离排序，取前 K 个候选
    let bestIdx = 0;
    if (this.palette.length <= CANDIDATE_K) {
      // 色板很小，直接全量精确计算
      let best = Infinity;
      for (const c of this.palette) {
        const d = ciede2000(targetLab, c.lab);
        if (d < best) { best = d; bestIdx = c.index; }
      }
    } else {
      const scored = this.palette
        .map(c => ({ i: c.index, d: labDistance(targetLab, c.lab) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, CANDIDATE_K);

      // 第二步：候选上做精确 CIEDE2000
      let best = Infinity;
      for (const s of scored) {
        const d = ciede2000(targetLab, this.palette[s.i].lab);
        if (d < best) { best = d; bestIdx = s.i; }
      }
    }

    this._matchCache.set(key, bestIdx);
    return bestIdx;
  }

  /** matchIndex 的同时返回色差 */
  matchWithDistance(r, g, b) {
    const idx = this.matchIndex(r, g, b);
    const d = ciede2000(cachedLab(r, g, b), this.palette[idx].lab);
    return { index: idx, distance: d };
  }

  /** 两个色板索引之间的 CIEDE2000 色差 */
  distanceBetween(i1, i2) {
    if (i1 === i2) return 0;
    return ciede2000(this.palette[i1].lab, this.palette[i2].lab);
  }
}

/**
 * 兼容旧接口：将像素数组映射到最接近的拼豆颜色。
 * （保留给潜在的外部调用；核心管线请使用 beadEngine + PaletteMatcher）
 */
function mapToBeadColors(pixels, beadPalette) {
  const matcher = new PaletteMatcher(beadPalette);
  const colorMap = new Map();

  const mapped = pixels.map(pixel => {
    const idx = matcher.matchIndex(pixel.r, pixel.g, pixel.b);
    const bead = matcher.get(idx);

    const key = bead.code;
    if (!colorMap.has(key)) {
      colorMap.set(key, { ...bead, rgb: bead.rgb, count: 0 });
    }
    colorMap.get(key).count++;

    return {
      r: bead.rgb[0],
      g: bead.rgb[1],
      b: bead.rgb[2],
      beadCode: bead.code,
      beadName: bead.name
    };
  });

  const colorStats = Array.from(colorMap.values()).sort((a, b) => b.count - a.count);
  return { pixels: mapped, colorStats };
}

module.exports = { PaletteMatcher, mapToBeadColors };
