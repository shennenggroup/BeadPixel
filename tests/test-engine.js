/**
 * BeadPixel 核心算法测试
 *
 * 生成 4 张合成测试图（动漫人物 / 真人照片风格 / Logo / 文字图标），
 * 验证：
 *   测试1  动漫图片：轮廓/眼睛/头发/衣服可识别
 *   测试2  真人照片：肤色/明暗自然
 *   测试3  Logo/文字：边缘清晰
 *   测试4  同图 16/32/64 色：颜色数真实生效
 *   测试5  同图 32/64/100 网格：拼豆格子数精确
 * 附加：抖动模式、渲染 PNG、PDF、CSV、性能
 *
 * 运行：node tests/test-engine.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { BeadEngine } = require('../src/services/beadEngine');
const { renderMatrix } = require('../src/services/beadRenderer');
const { generateCsv } = require('../src/services/csvGenerator');
const PDFGenerator = require('../src/services/pdfGenerator');

const TEST_DIR = path.join(__dirname, 'fixtures');
const OUT_DIR = path.join(__dirname, 'output');
const engine = new BeadEngine();

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ ${msg}`); }
}
function section(name) { console.log(`\n━━━ ${name} ━━━`); }

// ---------- 合成测试图 ----------

/** 测试图1：动漫人物（黑描边、大眼睛、头发、衣服、渐变背景） */
function animeSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#87CEEB"/><stop offset="100%" stop-color="#E0F6FF"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <!-- 头发 -->
  <path d="M 156 260 C 140 120 240 60 300 80 C 380 100 420 180 400 300
           L 360 260 C 380 180 340 120 290 120 C 230 120 190 180 200 260 Z"
        fill="#3B2A20" stroke="#000" stroke-width="6"/>
  <!-- 脸 -->
  <ellipse cx="270" cy="290" rx="105" ry="115" fill="#FFE0C8" stroke="#000" stroke-width="6"/>
  <!-- 头发前帘 -->
  <path d="M 165 250 C 190 150 350 150 375 250 C 340 210 300 195 270 195
           C 240 195 200 210 165 250 Z" fill="#4A352A" stroke="#000" stroke-width="5"/>
  <!-- 眼睛 -->
  <ellipse cx="228" cy="300" rx="22" ry="28" fill="#FFFFFF" stroke="#000" stroke-width="4"/>
  <ellipse cx="312" cy="300" rx="22" ry="28" fill="#FFFFFF" stroke="#000" stroke-width="4"/>
  <circle cx="230" cy="305" r="13" fill="#2E5FA3"/>
  <circle cx="314" cy="305" r="13" fill="#2E5FA3"/>
  <circle cx="230" cy="305" r="6" fill="#111"/>
  <circle cx="314" cy="305" r="6" fill="#111"/>
  <circle cx="235" cy="298" r="3.5" fill="#FFF"/>
  <circle cx="319" cy="298" r="3.5" fill="#FFF"/>
  <!-- 眉毛 + 嘴 -->
  <path d="M 205 265 Q 228 255 250 265" stroke="#000" stroke-width="5" fill="none"/>
  <path d="M 290 265 Q 312 255 334 265" stroke="#000" stroke-width="5" fill="none"/>
  <path d="M 250 355 Q 270 370 290 355" stroke="#C0392B" stroke-width="5" fill="none"/>
  <!-- 腮红 -->
  <ellipse cx="195" cy="335" rx="16" ry="9" fill="#FFB6A3" opacity="0.8"/>
  <ellipse cx="345" cy="335" rx="16" ry="9" fill="#FFB6A3" opacity="0.8"/>
  <!-- 身体/衣服 -->
  <path d="M 180 480 C 190 400 230 380 270 380 C 310 380 350 400 360 480 Z"
        fill="#E74C3C" stroke="#000" stroke-width="6"/>
  <path d="M 240 385 L 270 420 L 300 385" fill="#FFF" stroke="#000" stroke-width="4"/>
</svg>`;
}

/** 测试图2：真人照片风格（肤色渐变、明暗、五官） */
function photoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <radialGradient id="skin" cx="0.45" cy="0.4" r="0.9">
      <stop offset="0%" stop-color="#F5C89F"/><stop offset="60%" stop-color="#E8B487"/>
      <stop offset="100%" stop-color="#C99569"/>
    </radialGradient>
    <linearGradient id="hairp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4B3621"/><stop offset="100%" stop-color="#2E2115"/>
    </linearGradient>
    <linearGradient id="bgp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#5D6D7E"/><stop offset="100%" stop-color="#34495E"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bgp)"/>
  <!-- 头发 -->
  <path d="M 160 300 C 145 130 250 70 320 95 C 395 120 410 220 395 310
           C 380 240 350 200 300 195 C 240 190 195 230 185 300 Z" fill="url(#hairp)"/>
  <!-- 脸（立体渐变） -->
  <ellipse cx="272" cy="290" rx="100" ry="115" fill="url(#skin)"/>
  <!-- 阴影侧 -->
  <path d="M 330 210 C 360 250 365 330 340 380 C 370 340 385 280 370 230 Z" fill="#B5835C" opacity="0.5"/>
  <!-- 眼睛 -->
  <ellipse cx="235" cy="295" rx="17" ry="9" fill="#FFF"/>
  <ellipse cx="310" cy="295" rx="17" ry="9" fill="#FFF"/>
  <circle cx="237" cy="295" r="6.5" fill="#5B3A1E"/>
  <circle cx="312" cy="295" r="6.5" fill="#5B3A1E"/>
  <path d="M 215 278 Q 235 270 255 278" stroke="#3E2A18" stroke-width="4" fill="none"/>
  <path d="M 290 278 Q 310 270 330 278" stroke="#3E2A18" stroke-width="4" fill="none"/>
  <!-- 鼻子 + 嘴 -->
  <path d="M 272 315 L 266 340 Q 272 345 278 340" stroke="#C08A5F" stroke-width="4" fill="none"/>
  <path d="M 250 368 Q 272 382 294 368" stroke="#B05B4C" stroke-width="5" fill="none"/>
  <!-- 衣服 -->
  <path d="M 175 480 C 185 410 230 385 272 385 C 314 385 359 410 369 480 Z" fill="#1F618D"/>
  <path d="M 230 400 L 272 440 L 314 400" fill="#F4F6F7"/>
</svg>`;
}

/** 测试图3：Logo（高对比、文字、几何边缘） */
function logoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#FFFFFF"/>
  <circle cx="256" cy="200" r="120" fill="#1ABC9C"/>
  <path d="M 196 200 L 236 240 L 316 160" stroke="#FFF" stroke-width="28" fill="none" stroke-linecap="round"/>
  <text x="256" y="400" font-family="Arial, sans-serif" font-size="96" font-weight="bold"
        fill="#2C3E50" text-anchor="middle">OK</text>
  <rect x="106" y="450" width="300" height="8" fill="#1ABC9C"/>
</svg>`;
}

/** 测试图4：小文字 + 细线条图标（最难的场景） */
function textSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#FFF8E7"/>
  <text x="256" y="160" font-family="Arial, sans-serif" font-size="72" font-weight="bold"
        fill="#C0392B" text-anchor="middle">SALE</text>
  <path d="M 100 220 L 412 220" stroke="#C0392B" stroke-width="6"/>
  <path d="M 100 250 L 412 250" stroke="#E67E22" stroke-width="4" stroke-dasharray="20 10"/>
  <text x="256" y="360" font-family="Arial, sans-serif" font-size="48"
        fill="#2C3E50" text-anchor="middle">50% OFF</text>
  <path d="M 256 400 L 300 460 L 212 460 Z" fill="#27AE60" stroke="#145A32" stroke-width="4"/>
</svg>`;
}

async function ensureFixtures() {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const fixtures = [
    ['anime.png', animeSvg()],
    ['photo.png', photoSvg()],
    ['logo.png', logoSvg()],
    ['text.png', textSvg()]
  ];
  for (const [name, svg] of fixtures) {
    const p = path.join(TEST_DIR, name);
    if (!fs.existsSync(p)) {
      await sharp(Buffer.from(svg)).png().toFile(p);
    }
  }
  // 一张带 Alpha 的图（测展平）
  const alphaP = path.join(TEST_DIR, 'alpha.png');
  if (!fs.existsSync(alphaP)) {
    await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">
      <rect width="300" height="300" fill="none"/>
      <circle cx="150" cy="150" r="120" fill="#3498DB"/>
    </svg>`)).png().toFile(alphaP);
  }
}

// ---------- 校验工具 ----------

/** 矩阵一致性校验 */
function validateMatrix(m, msg) {
  assert(m && m.version === 2, `${msg}: 矩阵版本正确`);
  assert(Array.isArray(m.cells) && m.cells.length === m.height, `${msg}: 行数 = ${m.height}`);
  let colsOk = true, idxOk = true, countOk = true;
  const counts = new Map();
  for (const row of m.cells) {
    if (!Array.isArray(row) || row.length !== m.width) { colsOk = false; break; }
    for (const ci of row) {
      if (!Number.isInteger(ci) || ci < 0 || ci >= m.colors.length) { idxOk = false; break; }
      counts.set(ci, (counts.get(ci) || 0) + 1);
    }
  }
  assert(colsOk, `${msg}: 每行格子数 = ${m.width}`);
  assert(idxOk, `${msg}: 所有格子索引有效`);
  for (const c of m.colors) {
    if (counts.get(c.index - 1) !== c.count) { countOk = false; break; }
  }
  assert(countOk, `${msg}: 颜色计数与矩阵一致`);
  assert(m.totalBeads === m.width * m.height, `${msg}: 总颗数 = ${m.totalBeads}`);
  const sum = m.colors.reduce((s, c) => s + c.count, 0);
  assert(sum === m.totalBeads, `${msg}: 颜色计数总和 = 总颗数`);
  // 颜色必须是真实拼豆色
  const perler = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'beadColors', 'perler.json'), 'utf-8'));
  const validHex = new Set(perler.map(c => c.hex.toUpperCase()));
  assert(m.colors.every(c => validHex.has(c.hex.toUpperCase())), `${msg}: 所有颜色来自真实 Perler 色板`);
}

/** 简易"细节保留"度量：黑描边格子的比例（动漫图轮廓） */
function darkRatio(m) {
  let dark = 0, total = 0;
  for (const row of m.cells) {
    for (const ci of row) {
      const c = m.colors[ci];
      if (c.rgb[0] + c.rgb[1] + c.rgb[2] < 180) dark++;
      total++;
    }
  }
  return dark / total;
}

// ---------- 测试用例 ----------

async function run() {
  await ensureFixtures();
  const anime = path.join(TEST_DIR, 'anime.png');
  const photo = path.join(TEST_DIR, 'photo.png');
  const logo = path.join(TEST_DIR, 'logo.png');
  const text = path.join(TEST_DIR, 'text.png');
  const alpha = path.join(TEST_DIR, 'alpha.png');

  // ========== 测试 5：网格尺寸精确性 ==========
  section('测试5：网格尺寸（32/64/100）');
  for (const g of [32, 64, 100]) {
    const m = await engine.generate(anime, { gridWidth: g, gridHeight: g, colorLimit: 'auto', dithering: 'light' });
    assert(m.width === g && m.height === g, `请求 ${g}×${g} → 得到 ${m.width}×${m.height}`);
    validateMatrix(m, `${g}×${g}`);
  }
  // 非正方形 + 非正方形原图
  const mrect = await engine.generate(photo, { gridWidth: 48, gridHeight: 32, colorLimit: 32, dithering: 'light', fitMode: 'contain' });
  assert(mrect.width === 48 && mrect.height === 32, `非正方形网格 48×32 精确（原图为正方形，contain 留白）`);

  // ========== 测试 4：颜色数量控制 ==========
  section('测试4：颜色数量（16/32/64）');
  const results = {};
  for (const n of [16, 32, 64]) {
    const t0 = Date.now();
    results[n] = await engine.generate(photo, { gridWidth: 64, gridHeight: 64, colorLimit: n, dithering: 'light' });
    const dt = Date.now() - t0;
    assert(results[n].colors.length <= n, `限制 ${n} 色 → 实际 ${results[n].colors.length} 色（耗时 ${dt}ms）`);
    validateMatrix(results[n], `${n} 色`);
  }
  assert(results[16].colors.length <= results[32].colors.length, `16 色 (${results[16].colors.length}) ≤ 32 色 (${results[32].colors.length})`);
  assert(results[32].colors.length <= results[64].colors.length, `32 色 (${results[32].colors.length}) ≤ 64 色 (${results[64].colors.length})`);
  // 动漫图颜色丰富，用它验证不同上限产生不同结果
  const a8 = await engine.generate(anime, { gridWidth: 64, gridHeight: 64, colorLimit: 8, dithering: 'none' });
  const a64 = await engine.generate(anime, { gridWidth: 64, gridHeight: 64, colorLimit: 64, dithering: 'none' });
  assert(a8.colors.length <= 8 && a64.colors.length > a8.colors.length,
         `8 色 (${a8.colors.length}) < 64 色 (${a64.colors.length})，颜色上限真实生效`);
  assert(JSON.stringify(a8.cells) !== JSON.stringify(a64.cells), '不同颜色上限产生不同结果');
  // all 模式
  const mAll = await engine.generate(photo, { gridWidth: 64, gridHeight: 64, colorLimit: 'all', dithering: 'none' });
  assert(mAll.colors.length <= 50, `'all' 不超过色板总数（实际 ${mAll.colors.length}）`);

  // ========== 测试 1：动漫人物 ==========
  section('测试1：动漫人物（轮廓/眼睛/头发）');
  const mAnime = await engine.generate(anime, { gridWidth: 64, gridHeight: 64, colorLimit: 24, dithering: 'light' });
  validateMatrix(mAnime, '动漫');
  const dr = darkRatio(mAnime);
  assert(dr > 0.02, `黑色描边/深色得到保留（深色格占比 ${(dr * 100).toFixed(1)}%）`);
  // 眼睛位置：瞳孔圆心 (230,305) → 格 (28,38)（512px/64格 = 8px/格）
  const eyeCell = mAnime.cells[38][28];
  const eyeColor = mAnime.colors[eyeCell];
  assert(eyeColor.rgb[0] + eyeColor.rgb[1] + eyeColor.rgb[2] < 320, `眼睛位置为深色（${eyeColor.name}）`);
  // 头发：(196,212) 为深棕 #4A352A → 格 (24,26)（地面真值已从原图验证）
  const hairCell = mAnime.cells[26][24];
  const hairColor = mAnime.colors[hairCell];
  assert(hairColor.rgb[0] < 120 && hairColor.rgb[1] < 100, `头发区域为深色（${hairColor.name}）`);
  // 刘海带（原图 y=128~192 深色占比 49.8%）→ 矩阵 rows 16-24 应保留深色主体
  let hairBandDark = 0, hairBandTotal = 0;
  for (let y = 16; y <= 24; y++) {
    for (let x = 16; x <= 47; x++) {
      const c = mAnime.colors[mAnime.cells[y][x]];
      if (c.rgb[0] + c.rgb[1] + c.rgb[2] < 250) hairBandDark++;
      hairBandTotal++;
    }
  }
  assert(hairBandDark / hairBandTotal > 0.35,
         `刘海带深色主体保留（${(hairBandDark / hairBandTotal * 100).toFixed(1)}%，原图真值 49.8%）`);
  // 衣服为红色系
  const clothCell = mAnime.cells[58][32];
  const clothColor = mAnime.colors[clothCell];
  assert(clothColor.rgb[0] > 120 && clothColor.rgb[0] > clothColor.rgb[2], `衣服为红色系（${clothColor.name}）`);

  // ========== 测试 2：真人照片 ==========
  section('测试2：真人照片（肤色/明暗）');
  const mPhoto = await engine.generate(photo, { gridWidth: 64, gridHeight: 64, colorLimit: 32, dithering: 'light' });
  validateMatrix(mPhoto, '照片');
  // 脸颊中心应为肤色（暖色）
  const faceCell = mPhoto.colors[mPhoto.cells[40][32]];
  assert(faceCell.rgb[0] > faceCell.rgb[2] && faceCell.rgb[0] > 150, `脸颊为暖肤色（${faceCell.name}）`);
  // 背景应有冷色（灰蓝）
  const bgCell = mPhoto.colors[mPhoto.cells[5][5]];
  assert(bgCell.rgb[2] >= bgCell.rgb[0] || (bgCell.rgb[0] + bgCell.rgb[1] + bgCell.rgb[2]) < 300, `背景冷/暗色（${bgCell.name}）`);
  // 明暗：左上（受光）与右下（阴影衣服）
  const luma = c => 0.299 * c.rgb[0] + 0.587 * c.rgb[1] + 0.114 * c.rgb[2];
  const litFace = mPhoto.colors[mPhoto.cells[36][24]];
  const shadeFace = mPhoto.colors[mPhoto.cells[44][40]];
  assert(luma(litFace) >= luma(shadeFace) - 10, `面部明暗关系保留（受光 ${luma(litFace).toFixed(0)} ≥ 阴影 ${luma(shadeFace).toFixed(0)}）`);

  // ========== 测试 3：Logo / 文字 ==========
  section('测试3：Logo/文字（边缘/高对比）');
  const mLogo = await engine.generate(logo, { gridWidth: 48, gridHeight: 48, colorLimit: 16, dithering: 'none' });
  validateMatrix(mLogo, 'Logo');
  // 白底
  const cornerCell = mLogo.colors[mLogo.cells[2][2]];
  assert(cornerCell.rgb[0] > 220 && cornerCell.rgb[1] > 220 && cornerCell.rgb[2] > 220, `白底保持（${cornerCell.name}）`);
  // 圆内非对勾处 (180,150) → 格 (16,14)
  const circleCell = mLogo.colors[mLogo.cells[14][16]];
  assert(circleCell.rgb[1] > 120 && circleCell.rgb[0] < 120, `圆内 teal 色（${circleCell.name}）`);
  // 文字深色行
  const textRow = mLogo.cells[36];
  let darkTextCount = 0;
  for (const ci of textRow) {
    const c = mLogo.colors[ci];
    if (c.rgb[0] + c.rgb[1] + c.rgb[2] < 300) darkTextCount++;
  }
  assert(darkTextCount >= 3, `文字行含深色笔画格（${darkTextCount} 格）`);

  // 小文字图
  const mText = await engine.generate(text, { gridWidth: 64, gridHeight: 64, colorLimit: 16, dithering: 'none' });
  validateMatrix(mText, '文字图');
  const saleRow = mText.cells[18];
  let redCount = 0;
  for (const ci of saleRow) {
    const c = mText.colors[ci];
    if (c.rgb[0] > 140 && c.rgb[0] > c.rgb[2] + 40) redCount++;
  }
  assert(redCount >= 4, `SALE 红色笔画可识别（${redCount} 格）`);

  // ========== 抖动 ==========
  section('抖动模式');
  for (const d of ['none', 'light', 'standard']) {
    const m = await engine.generate(photo, { gridWidth: 48, gridHeight: 48, colorLimit: 24, dithering: d });
    validateMatrix(m, `抖动=${d}`);
  }
  const mNoD = await engine.generate(photo, { gridWidth: 48, gridHeight: 48, colorLimit: 24, dithering: 'none' });
  const mStdD = await engine.generate(photo, { gridWidth: 48, gridHeight: 48, colorLimit: 24, dithering: 'standard' });
  assert(JSON.stringify(mNoD.cells) !== JSON.stringify(mStdD.cells), '抖动真实改变结果');

  // ========== 适应模式 / Alpha ==========
  section('适应模式 + Alpha 展平');
  for (const fit of ['contain', 'cover', 'stretch']) {
    const m = await engine.generate(alpha, { gridWidth: 40, gridHeight: 40, colorLimit: 16, dithering: 'none', fitMode: fit });
    validateMatrix(m, `fit=${fit}`);
  }

  // ========== 渲染 / 导出 ==========
  section('渲染与导出');
  const mRender = await engine.generate(anime, { gridWidth: 64, gridHeight: 64, colorLimit: 32, dithering: 'light' });
  const t0 = Date.now();
  const beadPng = await renderMatrix(mRender, { style: 'bead', scale: 12, showGrid: true });
  fs.writeFileSync(path.join(OUT_DIR, 'anime-bead.png'), beadPng);
  const pixelPng = await renderMatrix(mRender, { style: 'pixel', scale: 12, showGrid: true });
  fs.writeFileSync(path.join(OUT_DIR, 'anime-pixel.png'), pixelPng);
  assert(beadPng.length > 1000 && pixelPng.length > 1000, `PNG 渲染成功（bead ${(beadPng.length / 1024).toFixed(0)}KB, pixel ${(pixelPng.length / 1024).toFixed(0)}KB, 耗时 ${Date.now() - t0}ms）`);

  const meta = await sharp(beadPng).metadata();
  assert(meta.width === 64 * 12 && meta.height === 64 * 12, `渲染尺寸精确 = ${meta.width}×${meta.height}`);

  const pdfGen = new PDFGenerator();
  const pdfBuf = await pdfGen.generatePDF(mRender, { pageSize: 'A4', showGrid: true, showNumbers: true, splitPages: false });
  fs.writeFileSync(path.join(OUT_DIR, 'anime-pattern.pdf'), pdfBuf);
  assert(pdfBuf.length > 5000 && pdfBuf.slice(0, 4).toString() === '%PDF', `PDF 生成成功（${(pdfBuf.length / 1024).toFixed(0)}KB）`);

  const csvStr = generateCsv(mRender, { includeGrid: true });
  fs.writeFileSync(path.join(OUT_DIR, 'anime-colors.csv'), '\uFEFF' + csvStr, 'utf-8');
  assert(csvStr.includes('颜色清单') && csvStr.includes('图纸网格'), 'CSV 包含颜色清单和图纸网格');

  // 大网格性能
  section('性能');
  const t1 = Date.now();
  const mBig = await engine.generate(photo, { gridWidth: 100, gridHeight: 100, colorLimit: 'auto', dithering: 'light' });
  const tEngine = Date.now() - t1;
  validateMatrix(mBig, '100×100');
  assert(tEngine < 15000, `100×100 网格引擎耗时 ${tEngine}ms < 15s`);

  console.log(`\n══════════════════════════════════`);
  console.log(`结果: ${pass} 通过, ${fail} 失败`);
  console.log(`输出目录: ${OUT_DIR}`);
  process.exit(fail > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
