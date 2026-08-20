/**
 * PDF 图纸生成服务 —— 基于统一拼豆矩阵
 *
 * 图纸内容：
 *   首页：
 *     · 标题 + 作品信息（尺寸 / 实际尺寸 / 品牌 / 颜色数 / 总颗数）
 *     · 拼豆网格（每格显示颜色编号，如 01 02 03）
 *   颜色清单页：
 *     · 编号 / 色号 / 名称 / 色块 / HEX / 数量
 *   可选：大图分页模式（每页只放一部分网格，格子更大更易读）
 */

const fs = require('fs');
const PDFDocument = require('pdfkit');

/**
 * 查找系统中可用的中文字体（CJK）。
 * PDFKit 内置的 Helvetica 不含中文字形，必须用支持中文的字体，
 * 否则导出的 PDF 里所有中文都会变成方块 / 乱码。
 * 优先返回 .ttf；都找不到则返回 null（调用方回退到 Helvetica）。
 */
function findCjkFont() {
  const candidates = [
    // Windows
    'C:/Windows/Fonts/simhei.ttf',
    'C:/Windows/Fonts/simkai.ttf',
    'C:/Windows/Fonts/simfang.ttf',
    'C:/Windows/Fonts/STSONG.TTF',
    'C:/Windows/Fonts/STKAITI.TTF',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simsun.ttc',
    // macOS
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Light.ttc',
    '/Library/Fonts/Arial Unicode.ttf',
    // Linux
    '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf'
  ];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

const PAGE_SIZES = {
  A4: [841.89, 595.28],     // landscape
  Letter: [792, 612]
};

class PDFGenerator {
  /**
   * @param {Object} matrix - 拼豆矩阵（beadEngine 输出）
   * @param {Object} options - { pageSize, showGrid, showNumbers, splitPages }
   * @returns {Promise<Buffer>}
   */
  async generatePDF(matrix, options = {}) {
    const pageSize = PAGE_SIZES[options.pageSize] ? options.pageSize : 'A4';
    const showGrid = options.showGrid !== false;
    const showNumbers = options.showNumbers !== false;
    const splitPages = options.splitPages === true;

    const [pageW, pageH] = PAGE_SIZES[pageSize];
    const doc = new PDFDocument({
      size: pageSize,
      layout: 'landscape',
      margin: 36,
      info: { Title: 'BeadPixel 拼豆图纸' }
    });

    // 注册中文字体，避免中文乱码；找不到则回退 Helvetica
    const cjkPath = findCjkFont();
    let F = 'Helvetica';
    if (cjkPath) {
      try { doc.registerFont('cjk', cjkPath); F = 'cjk'; }
      catch (e) { F = 'Helvetica'; }
    }

    const chunks = [];
    doc.on('data', c => chunks.push(c));
    const done = new Promise(resolve => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const { width, height, colors, totalBeads, meta } = matrix;

    // ---------- 首页：信息 + 网格 ----------
    doc.fontSize(20).font(F)
      .text('BeadPixel 拼豆图纸', 36, 30, { align: 'center', width: pageW - 72 });
    doc.fontSize(10).font(F).fillColor('#333333');
    const infoLine = [
      `作品尺寸: ${width} × ${height} 颗`,
      `实际尺寸: ${meta.physicalWidthCm} × ${meta.physicalHeightCm} cm`,
      `拼豆品牌: ${meta.brandName}（${meta.beadSizeMm}mm）`,
      `使用颜色: ${colors.length} 种`,
      `拼豆总数: ${totalBeads} 颗`
    ].join('    |    ');
    doc.text(infoLine, 36, 56, { align: 'center', width: pageW - 72 });

    const gridTop = 78;
    const availW = pageW - 72;
    const availH = pageH - gridTop - 40;

    if (!splitPages) {
      this._drawGridPage(doc, matrix, 36, gridTop, availW, availH, {
        showGrid, showNumbers, fontName: F, x0: 0, y0: 0, x1: width, y1: height
      });
    } else {
      // 分页模式：每页放一大块（目标格子 ≥ 14pt，能清晰显示两位编号）
      const targetCell = 15;
      const chunkW = Math.max(10, Math.floor(availW / targetCell));
      const chunkH = Math.max(10, Math.floor(availH / targetCell));
      let pageNo = 0;
      for (let y0 = 0; y0 < height; y0 += chunkH) {
        for (let x0 = 0; x0 < width; x0 += chunkW) {
          if (pageNo > 0) doc.addPage();
          const x1 = Math.min(width, x0 + chunkW);
          const y1 = Math.min(height, y0 + chunkH);
          this._drawGridPage(doc, matrix, 36, gridTop, availW, availH, {
            showGrid, showNumbers, fontName: F, x0, y0, x1, y1,
            label: `局部图 第 ${pageNo + 1} 页（列 ${x0 + 1}-${x1}，行 ${y0 + 1}-${y1}）`
          });
          pageNo++;
        }
      }
    }

    // ---------- 颜色清单页 ----------
    doc.addPage();
    doc.fontSize(16).font(F).fillColor('#000000')
      .text('颜色清单', 36, 30);
    doc.fontSize(10).font(F).fillColor('#333333')
      .text(`共 ${colors.length} 种颜色，合计 ${totalBeads} 颗拼豆`, 36, 52);

    // 双栏图例
    const colW = (pageW - 72) / 2;
    const rowH = 22;
    const topY = 74;
    const perCol = Math.floor((pageH - topY - 40) / rowH);

    colors.forEach((c, i) => {
      const col = Math.floor(i / perCol);
      const row = i % perCol;
      if (col >= 2) return; // 超出两栏则丢弃（不太可能：色板最多 50 色）
      const x = 36 + col * colW;
      const y = topY + row * rowH;

      doc.rect(x, y + 3, 14, 14).lineWidth(0.5).fillAndStroke(c.hex, '#999999');
      const num = String(c.index).padStart(2, '0');
      doc.fontSize(9).font(F).fillColor('#000000')
        .text(`${num}  ${c.code}`, x + 20, y + 4);
      doc.fontSize(8.5).font(F).fillColor('#444444')
        .text(`${c.name}  ${c.hex}  ×${c.count}`, x + 20, y + 13);
    });

    // 页脚
    doc.fontSize(8).fillColor('#999999')
      .text('Generated by BeadPixel', 36, pageH - 28, { width: pageW - 72, align: 'center' });

    doc.end();
    return done;
  }

  /**
   * 绘制一页网格（整图或局部）
   */
  _drawGridPage(doc, matrix, left, top, availW, availH, opts) {
    const { showGrid, showNumbers, fontName = 'Helvetica', x0, y0, x1, y1, label } = opts;
    const gw = x1 - x0;
    const gh = y1 - y0;

    let topY = top;
    if (label) {
      doc.fontSize(9).font(fontName).fillColor('#555555')
        .text(label, left, top - 4);
      topY = top + 12;
      availH -= 12;
    }

    const cell = Math.min(availW / gw, availH / gh, 24);
    const gridW = cell * gw;
    const gridH = cell * gh;
    const gx = left + (availW - gridW) / 2;
    const gy = topY + (availH - gridH) / 2;

    const fontSize = Math.max(4.5, cell * 0.42);
    const canNumber = showNumbers && cell >= 9;

    for (let y = y0; y < y1; y++) {
      const row = matrix.cells[y];
      for (let x = x0; x < x1; x++) {
        const color = matrix.colors[row[x]];
        const px = gx + (x - x0) * cell;
        const py = gy + (y - y0) * cell;

        doc.rect(px, py, cell, cell).lineWidth(0).fill(color.hex);

        if (showGrid) {
          doc.rect(px, py, cell, cell).lineWidth(0.25).stroke('#BBBBBB');
        }

        if (canNumber) {
          // 根据格子颜色亮度选择黑/白编号，保证可读
          const [r, g, b] = color.rgb;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          const num = String(color.index).padStart(2, '0');
          doc.fontSize(fontSize).font(fontName)
            .fillColor(lum > 140 ? '#1A1A1A' : '#FFFFFF')
            .text(num, px + 0.5, py + (cell - fontSize) / 2 - 0.5, {
              width: cell - 1, align: 'center', lineBreak: false
            });
        }
      }
    }

    // 外框
    doc.rect(gx, gy, gridW, gridH).lineWidth(1).stroke('#666666');

    // 坐标标记（每 10 格）
    if (cell >= 6) {
      doc.fontSize(Math.min(7, cell * 0.5)).font(fontName).fillColor('#888888');
      for (let x = 10; x < gw; x += 10) {
        doc.text(String(x0 + x), gx + x * cell - 8, gy - 10, { width: 16, align: 'center' });
      }
      for (let y = 10; y < gh; y += 10) {
        doc.text(String(y0 + y), gx - 16, gy + y * cell - 4, { width: 12, align: 'right' });
      }
    }
  }
}

module.exports = PDFGenerator;
