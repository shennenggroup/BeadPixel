/**
 * 拼豆视觉渲染服务
 *
 * 基于统一拼豆矩阵渲染 PNG：
 *  - pixel 风格：纯色方块（像素图）
 *  - bead  风格：真实拼豆视觉 —— 圆形豆体、中心孔、左上高光、
 *    右下阴影、豆间间距、浅色底板
 *
 * 所有导出 PNG（预览 / 下载）都基于这里，保证"一个格子 = 一颗拼豆"。
 */

const sharp = require('sharp');

const MAX_RENDER_PIXELS = 20 * 1024 * 1024; // 输出图像素上限

/**
 * 渲染拼豆矩阵为 PNG Buffer
 * @param {Object} matrix - 拼豆矩阵（beadEngine 输出）
 * @param {Object} opts
 * @param {string} opts.style   - 'pixel' | 'bead'
 * @param {number} opts.scale   - 每颗拼豆的像素大小（px/格）
 * @param {boolean} opts.showGrid - 是否叠加网格线
 * @param {boolean} opts.showNumbers - 是否在每个格子上叠加颜色编号（1 基，如 01）
 * @param {number} opts.maxWidth - 输出最大宽度限制（预览用）
 */
async function renderMatrix(matrix, opts = {}) {
  const style = opts.style === 'pixel' ? 'pixel' : 'bead';
  const showGrid = opts.showGrid !== false;
  const showNumbers = opts.showNumbers === true;

  let scale = Math.max(1, Math.round(opts.scale || 12));
  // 限制输出尺寸
  const maxByPixels = Math.floor(Math.sqrt(MAX_RENDER_PIXELS / (matrix.width * matrix.height)));
  scale = Math.min(scale, Math.max(1, maxByPixels));
  if (opts.maxWidth) {
    scale = Math.min(scale, Math.max(1, Math.floor(opts.maxWidth / matrix.width)));
  }

  const W = matrix.width * scale;
  const H = matrix.height * scale;

  const svg = style === 'bead'
    ? buildBeadSvg(matrix, scale, showGrid, showNumbers)
    : buildPixelSvg(matrix, scale, showGrid, showNumbers);

  return sharp(Buffer.from(svg), { density: 96 })
    .resize(W, H, { kernel: 'nearest' })
    .png()
    .toBuffer();
}

/** SVG 数字/字符串转义 */
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- 拼豆风格 ----------

function buildBeadSvg(matrix, scale, showGrid, showNumbers) {
  const W = matrix.width * scale;
  const H = matrix.height * scale;
  const cx = scale / 2;
  const r = scale * 0.44;        // 豆体半径（留出豆间距）
  const holeR = Math.max(1, scale * 0.10); // 中心孔
  const gap = scale - r * 2;

  const parts = [];
  const numParts = [];
  // 编号仅在格子足够大时才叠加，避免拥挤看不清
  const canNumber = showNumbers && scale >= 8;
  const numFont = Math.max(7, Math.round(scale * 0.42));

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<defs>`,
    // 豆体立体感：左上受光 -> 右下背光
    `<radialGradient id="bd" cx="0.35" cy="0.3" r="0.85">`,
    `<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.42"/>`,
    `<stop offset="45%" stop-color="#FFFFFF" stop-opacity="0.06"/>`,
    `<stop offset="82%" stop-color="#000000" stop-opacity="0.02"/>`,
    `<stop offset="100%" stop-color="#000000" stop-opacity="0.30"/>`,
    `</radialGradient>`,
    `</defs>`,
    // 底板（拼豆板）
    `<rect width="${W}" height="${H}" fill="#E9E4DA"/>`
  );

  for (let y = 0; y < matrix.height; y++) {
    const row = matrix.cells[y];
    const py = y * scale + cx;
    for (let x = 0; x < matrix.width; x++) {
      const color = matrix.colors[row[x]];
      const px = x * scale + cx;
      parts.push(
        `<circle cx="${px}" cy="${py}" r="${r}" fill="${esc(color.hex)}"/>`,
        `<circle cx="${px}" cy="${py}" r="${r}" fill="url(#bd)"/>`,
        // 中心孔（半透明深色，模拟真实拼豆孔）
        `<circle cx="${px}" cy="${py}" r="${holeR}" fill="#000" fill-opacity="0.34"/>`,
        // 左上小高光点
        `<circle cx="${(px - r * 0.38).toFixed(1)}" cy="${(py - r * 0.38).toFixed(1)}" r="${Math.max(0.8, r * 0.16).toFixed(1)}" fill="#FFF" fill-opacity="0.5"/>`
      );
      if (canNumber) {
        numParts.push(buildNumberText(px, py, color, numFont));
      }
    }
  }

  if (showGrid && scale >= 8) {
    const g = [];
    const sw = scale >= 16 ? 1 : 0.5;
    g.push(`<g stroke="rgba(0,0,0,0.10)" stroke-width="${sw}">`);
    for (let x = 0; x <= matrix.width; x++) {
      g.push(`<line x1="${x * scale}" y1="0" x2="${x * scale}" y2="${H}"/>`);
    }
    for (let y = 0; y <= matrix.height; y++) {
      g.push(`<line x1="0" y1="${y * scale}" x2="${W}" y2="${y * scale}"/>`);
    }
    // 每 10 格加粗参考线（拼豆板习惯）
    g.push(`</g><g stroke="rgba(0,0,0,0.28)" stroke-width="${sw * 1.5}">`);
    for (let x = 0; x <= matrix.width; x += 10) {
      g.push(`<line x1="${x * scale}" y1="0" x2="${x * scale}" y2="${H}"/>`);
    }
    for (let y = 0; y <= matrix.height; y += 10) {
      g.push(`<line x1="0" y1="${y * scale}" x2="${W}" y2="${y * scale}"/>`);
    }
    g.push(`</g>`);
    parts.push(g.join(''));
  }

  if (numParts.length) parts.push(`<g>${numParts.join('')}</g>`);

  parts.push('</svg>');
  return parts.join('');
}

/**
 * 生成单个格子中心处的编号文本（1 基，2 位补零）。
 * 根据格子亮度自动选黑/白字，保证可读。
 */
function buildNumberText(cx, cy, color, fontPx) {
  const [r, g, b] = color.rgb;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  const fill = lum > 140 ? '#1A1A1A' : '#FFFFFF';
  const num = String(color.index).padStart(2, '0');
  return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-family="Arial, Helvetica, sans-serif" ` +
    `font-weight="700" font-size="${fontPx}" fill="${fill}" text-anchor="middle" ` +
    `dominant-baseline="central" alignment-baseline="central">${esc(num)}</text>`;
}

// ---------- 像素风格 ----------

function buildPixelSvg(matrix, scale, showGrid, showNumbers) {
  const W = matrix.width * scale;
  const H = matrix.height * scale;

  const parts = [];
  const numParts = [];
  const canNumber = showNumbers && scale >= 8;
  const numFont = Math.max(7, Math.round(scale * 0.42));

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);

  for (let y = 0; y < matrix.height; y++) {
    const row = matrix.cells[y];
    for (let x = 0; x < matrix.width; x++) {
      const color = matrix.colors[row[x]];
      const px = x * scale;
      const py = y * scale;
      parts.push(`<rect x="${px}" y="${py}" width="${scale}" height="${scale}" fill="${esc(color.hex)}"/>`);
      if (canNumber) {
        numParts.push(buildNumberText(px + scale / 2, py + scale / 2, color, numFont));
      }
    }
  }

  if (showGrid && scale >= 6) {
    const sw = scale >= 16 ? 1 : 0.5;
    parts.push(`<g stroke="rgba(0,0,0,0.15)" stroke-width="${sw}">`);
    for (let x = 0; x <= matrix.width; x++) {
      parts.push(`<line x1="${x * scale}" y1="0" x2="${x * scale}" y2="${H}"/>`);
    }
    for (let y = 0; y <= matrix.height; y++) {
      parts.push(`<line x1="0" y1="${y * scale}" x2="${W}" y2="${y * scale}"/>`);
    }
    parts.push(`</g>`);
  }

  if (numParts.length) parts.push(`<g>${numParts.join('')}</g>`);

  parts.push('</svg>');
  return parts.join('');
}

module.exports = { renderMatrix };
