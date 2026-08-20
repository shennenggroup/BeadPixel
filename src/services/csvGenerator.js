/**
 * CSV 生成服务 —— 基于统一拼豆矩阵
 *
 * 输出内容：
 *   1. 作品信息（尺寸 / 品牌 / 颜色数 / 总颗数 / 实际尺寸）
 *   2. 颜色清单（编号、色号、名称、HEX、RGB、数量）
 *   3. 图纸网格（每行 = 拼豆一行，格子里是颜色编号）
 */

/**
 * 生成 CSV 字符串
 * @param {Object} matrix - 拼豆矩阵
 * @param {Object} [opts] - { includeGrid: true } 是否包含图纸网格
 */
function generateCsv(matrix, opts = {}) {
  const includeGrid = opts.includeGrid !== false;
  const { width, height, colors, totalBeads, meta } = matrix;

  const rows = [];
  const q = s => `"${String(s).replace(/"/g, '""')}"`;

  rows.push(q('BeadPixel 拼豆图纸'));
  rows.push('');
  rows.push([q('项目'), q('值')].join(','));
  rows.push([q('作品尺寸'), q(`${width} × ${height} 颗拼豆`)].join(','));
  rows.push([q('实际尺寸'), q(`${meta.physicalWidthCm} × ${meta.physicalHeightCm} cm（${meta.beadSizeMm}mm 拼豆）`)].join(','));
  rows.push([q('拼豆品牌'), q(meta.brandName)].join(','));
  rows.push([q('使用颜色数'), q(String(colors.length))].join(','));
  rows.push([q('拼豆总数量'), q(String(totalBeads))].join(','));
  rows.push([q('生成时间'), q(meta.generatedAt || '')].join(','));
  rows.push('');

  rows.push(q('颜色清单'));
  rows.push([q('编号'), q('色号'), q('颜色名称'), q('HEX'), q('RGB'), q('数量')].join(','));
  for (const c of colors) {
    rows.push([
      String(c.index).padStart(2, '0'),
      q(c.code),
      q(c.name),
      c.hex,
      q(c.rgb.join(',')),
      String(c.count)
    ].join(','));
  }
  rows.push('');

  if (includeGrid) {
    rows.push(q('图纸网格（数字 = 颜色编号）'));
    // 表头：列号
    const header = [q('行\\列')];
    for (let x = 0; x < width; x++) header.push(String((x + 1) % 10));
    rows.push(header.join(','));
    for (let y = 0; y < height; y++) {
      const row = [String(y + 1)];
      const cells = matrix.cells[y];
      for (let x = 0; x < width; x++) {
        row.push(String(colors[cells[x]].index).padStart(2, '0'));
      }
      rows.push(row.join(','));
    }
  }

  return rows.join('\n');
}

module.exports = { generateCsv };
