/**
 * 颜色数量控制（真实色板裁剪）
 *
 * 目标：用户选择"最多 N 种颜色"时，从【真实拼豆色板】中挑选
 * 最适合当前图片的 N 种颜色 —— 不是生成虚拟颜色，也不是简单
 * 删掉出现次数少的颜色。
 *
 * 算法（带细节优先策略的贪心合并）：
 * 1. 先把每个格子匹配到完整色板，得到每个拼豆颜色的"加权使用量"
 *    （权重 = 1 + 细节加成 —— 处于边缘/高对比区域的格子更重要）；
 * 2. 计算被使用颜色两两之间的 CIEDE2000 色差矩阵（色板 ≤ 200，代价很小）；
 * 3. 贪心迭代：每轮移除"移除代价"最小的颜色。
 *    移除代价 = 加权使用量 × 到最近存活颜色的色差。
 *    —— 使用量少【且】在色板上有近似替代色的颜色最先被移除；
 *    使用量少但无可替代（色差大）的颜色会保留（保护稀缺但重要的颜色，
 *    例如眼睛高光、深色描边）；
 * 4. 被移除颜色的使用量并入其替代色，重复直到数量达标；
 * 5. 输出 映射表（原色板索引 -> 存活色板索引）。
 */

const { ciede2000 } = require('../utils/colorUtils');

/**
 * 从真实色板中选出最多 limit 种颜色。
 *
 * @param {Map<number, number>} usage - 色板索引 -> 加权使用量（格子权重和）
 * @param {Array} paletteLabs - 色板 Lab 数组（与色板索引对齐）
 * @param {number} limit - 最多保留的颜色数；'auto' 或 0 表示自动
 * @param {Object} [opts]
 * @param {number} [opts.autoCoverage] - auto 模式下的累计覆盖率阈值（默认 0.995）
 * @returns {Map<number, number>} 原索引 -> 存活索引 的映射（含未使用色板色不动的情况：不出现）
 */
function reducePalette(usage, paletteLabs, limit, opts = {}) {
  const autoCoverage = opts.autoCoverage != null ? opts.autoCoverage : 0.995;

  const usedIdx = Array.from(usage.keys()).filter(i => usage.get(i) > 0);
  if (usedIdx.length === 0) return new Map();

  // ---------- 自动模式：按累计加权覆盖率截断长尾 ----------
  let effectiveLimit;
  if (limit === 'auto' || !limit || limit <= 0) {
    const totalWeight = usedIdx.reduce((s, i) => s + usage.get(i), 0);
    const sorted = [...usedIdx].sort((a, b) => usage.get(b) - usage.get(a));
    let acc = 0;
    let count = 0;
    for (const i of sorted) {
      acc += usage.get(i) / totalWeight;
      count++;
      if (acc >= autoCoverage) break;
    }
    effectiveLimit = Math.max(1, count);
  } else {
    effectiveLimit = Math.min(Math.floor(limit), usedIdx.length);
  }

  if (usedIdx.length <= effectiveLimit) {
    // 无需裁剪，恒等映射
    const identity = new Map();
    for (const i of usedIdx) identity.set(i, i);
    return identity;
  }

  // ---------- 两两色差矩阵（只算被使用的颜色） ----------
  const m = usedIdx.length;
  const dist = new Float64Array(m * m); // 平铺矩阵
  for (let a = 0; a < m; a++) {
    for (let b = a + 1; b < m; b++) {
      const d = ciede2000(paletteLabs[usedIdx[a]], paletteLabs[usedIdx[b]]);
      dist[a * m + b] = d;
      dist[b * m + a] = d;
    }
  }

  // ---------- 贪心移除 ----------
  const alive = new Array(m).fill(true);
  const weights = usedIdx.map(i => usage.get(i));
  // mergeTarget[a] = a 被移除后并入了谁（索引链，最终都要落到存活节点）
  const mergeTarget = new Array(m).fill(-1);
  let aliveCount = m;

  const nearestAlive = (a) => {
    // 找 a（可能已死）能最终落到的存活节点的同时，返回最近存活邻居
    let best = -1, bestD = Infinity;
    for (let b = 0; b < m; b++) {
      if (b === a || !alive[b]) continue;
      const d = dist[a * m + b];
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };

  while (aliveCount > effectiveLimit) {
    // 每轮找出移除代价最小的存活颜色
    let victim = -1, victimCost = Infinity, victimTarget = -1;
    for (let a = 0; a < m; a++) {
      if (!alive[a]) continue;
      const t = nearestAlive(a);
      if (t === -1) continue; // 只剩一个
      const cost = weights[a] * dist[a * m + t];
      if (cost < victimCost) {
        victimCost = cost;
        victim = a;
        victimTarget = t;
      }
    }
    if (victim === -1) break;

    alive[victim] = false;
    mergeTarget[victim] = victimTarget;
    weights[victimTarget] += weights[victim];
    aliveCount--;
  }

  // ---------- 解析映射链：原索引 -> 最终存活索引 ----------
  const resolve = (a) => {
    let cur = a;
    let guard = 0;
    while (mergeTarget[cur] !== -1 && guard++ < m) {
      cur = mergeTarget[cur];
    }
    return cur;
  };

  const mapping = new Map();
  for (let a = 0; a < m; a++) {
    mapping.set(usedIdx[a], usedIdx[resolve(a)]);
  }
  return mapping;
}

/**
 * 兼容旧接口（原中位切分量化已被真实色板裁剪替代）。
 * 保留导出名以兼容潜在的旧调用，语义为：限制颜色数量。
 */
function quantizeColors(pixels, targetColors, beadMatcher) {
  if (!beadMatcher) {
    throw new Error('quantizeColors 现在需要传入 PaletteMatcher');
  }
  const usage = new Map();
  for (const p of pixels) {
    const idx = beadMatcher.matchIndex(p.r, p.g, p.b);
    usage.set(idx, (usage.get(idx) || 0) + 1);
  }
  const labs = beadMatcher.palette.map(c => c.lab);
  const mapping = reducePalette(usage, labs, targetColors);
  return pixels.map(p => {
    const idx = beadMatcher.matchIndex(p.r, p.g, p.b);
    const final = mapping.has(idx) ? mapping.get(idx) : idx;
    const bead = beadMatcher.get(final);
    return { r: bead.rgb[0], g: bead.rgb[1], b: bead.rgb[2] };
  });
}

module.exports = { reducePalette, quantizeColors };
