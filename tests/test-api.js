/**
 * API 集成测试（需要先启动服务器：node server.js）
 *
 * 验证完整链路：上传 → 生成（矩阵）→ 导出 PNG/PDF/CSV/矩阵
 *
 * 运行：node tests/test-api.js
 */

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.error(`  ❌ ${msg}`); }
}
function section(name) { console.log(`\n━━━ ${name} ━━━`); }

async function main() {
  // ---------- 上传 ----------
  section('上传');
  const fixture = path.join(__dirname, 'fixtures', 'anime.png');
  const form = new FormData();
  form.append('image', new Blob([fs.readFileSync(fixture)], { type: 'image/png' }), 'anime.png');

  const upRes = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  const upJson = await upRes.json();
  assert(upJson.success && upJson.imageId, `上传成功 (${upJson.imageId})`);
  const imageId = upJson.imageId;

  // ---------- 生成拼豆矩阵 ----------
  section('生成拼豆矩阵');
  const procRes = await fetch(`${BASE}/api/process/pixelate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageId,
      gridWidth: 64, gridHeight: 64,
      colorLimit: 24,
      dithering: 'light',
      beadBrand: 'perler',
      fitMode: 'contain',
      beadSizeMm: 5
    })
  });
  const procJson = await procRes.json();
  assert(procJson.success, '生成成功');
  assert(procJson.matrix && procJson.matrix.width === 64 && procJson.matrix.height === 64, '矩阵网格 = 64×64');
  assert(procJson.matrix.cells.length === 64 && procJson.matrix.cells[0].length === 64, '矩阵 cells 维度正确');
  assert(procJson.matrix.totalBeads === 4096, `总颗数 = ${procJson.matrix.totalBeads}`);
  assert(procJson.matrix.colors.length <= 24, `颜色数 ${procJson.matrix.colors.length} ≤ 24`);
  assert(procJson.matrix.colors.every(c => c.code && c.name && c.hex && c.count > 0), '颜色含真实色号/名称/数量');
  assert(procJson.meta && procJson.meta.physicalWidthCm === 32, '拼豆规格 5mm → 实际尺寸 32cm');
  const resultId = procJson.resultId;

  // 预览图可访问
  const prevRes = await fetch(`${BASE}${procJson.previewUrl}`);
  assert(prevRes.ok && prevRes.headers.get('content-type').includes('image/png'), '预览 PNG 可访问');

  // ---------- 参数真实生效（不同颜色上限 → 不同结果） ----------
  section('参数真实生效');
  const p16 = await (await fetch(`${BASE}/api/process/pixelate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, gridWidth: 48, gridHeight: 48, colorLimit: 8, dithering: 'none' })
  })).json();
  const p64 = await (await fetch(`${BASE}/api/process/pixelate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, gridWidth: 48, gridHeight: 48, colorLimit: 64, dithering: 'none' })
  })).json();
  assert(p16.matrix.colors.length <= 8 && p64.matrix.colors.length > p16.matrix.colors.length,
    `8 色 (${p16.matrix.colors.length}) < 64 色 (${p64.matrix.colors.length})`);

  // 网格尺寸严格
  const g100 = await (await fetch(`${BASE}/api/process/pixelate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, gridWidth: 100, gridHeight: 100, colorLimit: 32 })
  })).json();
  assert(g100.matrix.width === 100 && g100.matrix.height === 100 && g100.matrix.totalBeads === 10000,
    '100×100 精确（10000 颗）');

  // 旧参数兼容（boardWidth/boardHeight/quantizeColors）
  const legacy = await (await fetch(`${BASE}/api/process/pixelate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId, boardWidth: 32, boardHeight: 32, quantizeColors: 16, dithering: 'none' })
  })).json();
  assert(legacy.success && legacy.matrix.width === 32, '旧参数 boardWidth/quantizeColors 兼容');

  // ---------- 导出 ----------
  section('导出');
  const pngRes = await fetch(`${BASE}/api/export/png`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultId, style: 'bead', showGrid: true, scale: 14 })
  });
  const pngBuf = Buffer.from(await pngRes.arrayBuffer());
  assert(pngRes.ok && pngBuf.length > 5000 && pngBuf[0] === 0x89, `PNG 导出 (${(pngBuf.length / 1024).toFixed(0)}KB)`);
  fs.writeFileSync(path.join(__dirname, 'output', 'api-bead.png'), pngBuf);

  const pdfRes = await fetch(`${BASE}/api/export/pdf`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultId, pageSize: 'A4', showGrid: true, showNumbers: true, splitPages: false })
  });
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  assert(pdfRes.ok && pdfBuf.slice(0, 4).toString() === '%PDF', `PDF 导出 (${(pdfBuf.length / 1024).toFixed(0)}KB)`);
  fs.writeFileSync(path.join(__dirname, 'output', 'api-pattern.pdf'), pdfBuf);

  const csvRes = await fetch(`${BASE}/api/export/csv`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultId, includeGrid: true })
  });
  const csvText = await csvRes.text();
  assert(csvRes.ok && csvText.includes('颜色清单') && csvText.includes('P-'), 'CSV 导出（含真实色号）');
  fs.writeFileSync(path.join(__dirname, 'output', 'api-colors.csv'), csvText);

  // 矩阵恢复接口
  const matrixRes = await fetch(`${BASE}/api/export/matrix/${resultId}`);
  const matrixJson = await matrixRes.json();
  assert(matrixRes.ok && matrixJson.matrix.totalBeads === 4096, '矩阵查询接口');

  // 非法 resultId
  const badRes = await fetch(`${BASE}/api/export/png`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resultId: '../etc/passwd' })
  });
  assert(badRes.status === 400 || badRes.status === 404, '非法 resultId 被拒绝');

  console.log(`\n══════════════════════════════════`);
  console.log(`结果: ${pass} 通过, ${fail} 失败`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('API 测试失败（请确认服务器已启动: node server.js）:', err.message);
  process.exit(1);
});
