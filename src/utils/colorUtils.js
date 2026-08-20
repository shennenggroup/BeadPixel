/**
 * 颜色工具函数
 *
 * 提供 RGB <-> Lab 转换（带缓存）、CIEDE2000 色差计算、
 * 以及面向拼豆色板匹配的快速最近邻搜索辅助函数。
 */

const POW25_7 = 6103515625; // 25^7
const RAD = Math.PI / 180;

// ---------- RGB -> XYZ -> Lab ----------

function rgbToXyz(r, g, b) {
  let red = r / 255;
  let green = g / 255;
  let blue = b / 255;

  red = red > 0.04045 ? Math.pow((red + 0.055) / 1.055, 2.4) : red / 12.92;
  green = green > 0.04045 ? Math.pow((green + 0.055) / 1.055, 2.4) : green / 12.92;
  blue = blue > 0.04045 ? Math.pow((blue + 0.055) / 1.055, 2.4) : blue / 12.92;

  const x = red * 0.4124564 + green * 0.3575761 + blue * 0.1804375;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.0721750;
  const z = red * 0.0193339 + green * 0.1191920 + blue * 0.9503041;

  return { x: x * 100, y: y * 100, z: z * 100 };
}

function xyzToLab(x, y, z) {
  const refX = 95.047;
  const refY = 100.000;
  const refZ = 108.883;

  x = x / refX;
  y = y / refY;
  z = z / refZ;

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : (7.787 * x) + 16 / 116;
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : (7.787 * y) + 16 / 116;
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : (7.787 * z) + 16 / 116;

  return {
    L: (116 * y) - 16,
    a: 500 * (x - y),
    b: 200 * (y - z)
  };
}

/** RGB -> CIE Lab，无缓存 */
function rgbToLab(r, g, b) {
  const xyz = rgbToXyz(r, g, b);
  return xyzToLab(xyz.x, xyz.y, xyz.z);
}

// RGB(24bit 打包) -> Lab 的进程级缓存。
// 拼豆色板、格子目标色大量重复，缓存可避免 90% 以上的重复转换。
const _labCache = new Map();
const LAB_CACHE_LIMIT = 400000;

function labOfPacked(rgbInt) {
  let lab = _labCache.get(rgbInt);
  if (lab === undefined) {
    if (_labCache.size >= LAB_CACHE_LIMIT) _labCache.clear();
    lab = rgbToLab((rgbInt >> 16) & 255, (rgbInt >> 8) & 255, rgbInt & 255);
    _labCache.set(rgbInt, lab);
  }
  return lab;
}

function packRgb(r, g, b) {
  return (r << 16) | (g << 8) | b;
}

/** RGB -> Lab（带缓存），返回缓存中的稳定引用 */
function cachedLab(r, g, b) {
  return labOfPacked(packRgb(r, g, b));
}

// ---------- 色差 ----------

/**
 * CIEDE2000 色差。参数为 {L,a,b}。
 * 参考实现：Sharma et al. "The CIEDE2000 Color-Difference Formula" (2005)
 */
function ciede2000(lab1, lab2) {
  const L1 = lab1.L, a1 = lab1.a, b1 = lab1.b;
  const L2 = lab2.L, a2 = lab2.a, b2 = lab2.b;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cbar = (C1 + C2) / 2;

  const Cbar7 = Math.pow(Cbar, 7);
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + POW25_7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = 0;
  if (b1 !== 0 || a1p !== 0) {
    h1p = Math.atan2(b1, a1p) / RAD;
    if (h1p < 0) h1p += 360;
  }
  let h2p = 0;
  if (b2 !== 0 || a2p !== 0) {
    h2p = Math.atan2(b2, a2p) / RAD;
    if (h2p < 0) h2p += 360;
  }

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * RAD / 2);

  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;

  let hbp;
  if (C1p * C2p === 0) {
    hbp = h1p + h2p;
  } else {
    const diff = h2p - h1p;
    if (Math.abs(diff) <= 180) hbp = (h1p + h2p) / 2;
    else if (diff > 180) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hbp - 30) * RAD)
    + 0.24 * Math.cos(2 * hbp * RAD)
    + 0.32 * Math.cos((3 * hbp + 6) * RAD)
    - 0.20 * Math.cos((4 * hbp - 63) * RAD);

  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Cbp7 = Math.pow(Cbp, 7);
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + POW25_7));
  const SL = 1 + (0.015 * (Lbp - 50) * (Lbp - 50)) / Math.sqrt(20 + (Lbp - 50) * (Lbp - 50));
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * RAD) * RC;

  const dL = dLp / SL;
  const dC = dCp / SC;
  const dH = dHp / SH;

  return Math.sqrt(dL * dL + dC * dC + dH * dH + RT * dC * dH);
}

/** 两个 RGB 颜色之间的 CIEDE2000 色差（带 Lab 缓存） */
function ciede2000Rgb(r1, g1, b1, r2, g2, b2) {
  return ciede2000(cachedLab(r1, g1, b1), cachedLab(r2, g2, b2));
}

/** 简单 Lab 欧氏距离（快速预筛选用） */
function labDistance(lab1, lab2) {
  const dL = lab1.L - lab2.L;
  const da = lab1.a - lab2.a;
  const db = lab1.b - lab2.b;
  return dL * dL + da * da + db * db; // 平方距离，避免开方
}

/** 兼容旧接口：两颜色 Lab 距离 */
function colorDistanceLab(color1, color2) {
  const lab1 = rgbToLab(color1.r, color1.g, color1.b);
  const lab2 = rgbToLab(color2.r, color2.g, color2.b);
  return Math.sqrt(
    Math.pow(lab1.L - lab2.L, 2) +
    Math.pow(lab1.a - lab2.a, 2) +
    Math.pow(lab1.b - lab2.b, 2)
  );
}

/** RGB 欧氏距离 */
function colorDistanceRgb(c1, c2) {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// ---------- 其它 ----------

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

/** 相对亮度（Rec.709 近似，用于对比度/边缘计算） */
function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

module.exports = {
  rgbToXyz,
  xyzToLab,
  rgbToLab,
  cachedLab,
  packRgb,
  ciede2000,
  ciede2000Rgb,
  labDistance,
  colorDistanceLab,
  colorDistanceRgb,
  rgbToHex,
  hexToRgb,
  luminance
};
