/**
 * 预览组件（重构版）
 *
 * 基于后端返回的【拼豆矩阵】在前端本地渲染四种视图：
 *   - bead   拼豆模式：圆形豆体 + 中心孔 + 高光 + 阴影 + 豆间距 + 底板
 *   - pixel  图片模式：纯色方块
 *   - grid   网格模式：纯色 + 网格线 + 每 10 格参考线
 *   - number 编号模式：纯色 + 颜色编号（放大后可读）
 *
 * 另提供【画笔】模式：从编号调色板选色后在画布上点选/拖拽改色，
 * 修改通过 onPaintBatch 回调上报后端并自动保存。
 */

class Preview {
  constructor() {
    this.canvas = document.getElementById('pixelCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.originalImage = document.getElementById('originalImage');

    this.zoomInBtn = document.getElementById('zoomInBtn');
    this.zoomOutBtn = document.getElementById('zoomOutBtn');
    this.zoomLevelDisplay = document.getElementById('zoomLevel');
    this.brushToggleBtn = document.getElementById('brushToggleBtn');
    this.brushTool = document.getElementById('brushTool');
    this.brushPaletteEl = document.getElementById('brushPalette');
    this.brushSizeSel = document.getElementById('brushSize');
    this.undoBtn = document.getElementById('undoBtn');

    this.viewMode = 'bead';
    this.currentZoom = 1;
    this.matrix = null;

    // 画笔状态
    this.brushMode = false;
    this.brushColorIndex = 0; // colors[] 的 0 基下标
    this.brushSize = 1;
    this.isPainting = false;
    this.pendingChanges = new Map(); // "x,y" -> c
    this.strokeOld = {}; // 当前笔画中被改格的原色（用于回退）
    this.undoStack = []; // 每笔一帧：[{x,y,old}]
    this.onPaintBatch = null; // (changes[]) => {}

    this.init();
  }

  init() {
    this.zoomInBtn.addEventListener('click', () => this.zoom(1.5));
    this.zoomOutBtn.addEventListener('click', () => this.zoom(1 / 1.5));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });

    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewMode = btn.dataset.view;
        this.render();
      });
    });

    // 画笔：指针事件（同时覆盖鼠标与触摸）
    this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this.onPointerUp(e));
    this.canvas.addEventListener('contextmenu', (e) => { if (this.brushMode) e.preventDefault(); });

    if (this.brushToggleBtn) {
      this.brushToggleBtn.addEventListener('click', () => this.toggleBrush());
    }
    if (this.undoBtn) {
      this.undoBtn.addEventListener('click', () => this.undo());
    }
    if (this.brushSizeSel) {
      this.brushSizeSel.addEventListener('change', () => {
        this.brushSize = Math.max(1, Math.min(3, parseInt(this.brushSizeSel.value, 10) || 1));
      });
    }
  }

  setOriginalImage(url) {
    this.originalImage.src = url;
  }

  setMatrix(matrix) {
    this.matrix = matrix;
    this.undoStack = [];
    this.updateUndoBtn();
    this.fitZoom();
    this.render();
    // 画笔调色板仅在矩阵就绪后可用
    if (this.brushToggleBtn) this.brushToggleBtn.disabled = false;
    this.buildBrushPalette();
    this.brushColorIndex = 0;
  }

  /** 自动适配预览区宽度 */
  fitZoom() {
    if (!this.matrix) return;
    const wrapper = this.canvas.parentElement;
    const avail = Math.max(200, wrapper.clientWidth - 16);
    const base = Math.max(2, Math.floor(avail / this.matrix.width));
    this.baseScale = Math.min(base, 24);
    this.currentZoom = 1;
  }

  cellPx() {
    return Math.max(1, Math.round((this.baseScale || 8) * this.currentZoom));
  }

  zoom(factor) {
    this.currentZoom = Math.max(0.25, Math.min(20, this.currentZoom * factor));
    this.render();
  }

  render() {
    if (!this.matrix) return;
    const m = this.matrix;
    const s = this.cellPx();

    this.canvas.width = m.width * s;
    this.canvas.height = m.height * s;
    this.canvas.style.width = this.canvas.width + 'px';
    this.canvas.style.height = this.canvas.height + 'px';
    this.zoomLevelDisplay.textContent = Math.round(this.currentZoom * 100) + '%';

    const ctx = this.ctx;

    if (this.viewMode === 'bead') {
      this.renderBeads(ctx, m, s);
    } else {
      this.renderPixels(ctx, m, s);

      if (this.viewMode === 'grid' || this.viewMode === 'number') {
        this.drawGridLines(ctx, m, s, this.viewMode === 'grid');
      }
      if (this.viewMode === 'number' && s >= 7) {
        this.drawNumbers(ctx, m, s);
      }
    }
  }

  /** 拼豆模式：真实拼豆视觉 */
  renderBeads(ctx, m, s) {
    // 底板
    ctx.fillStyle = '#E9E4DA';
    ctx.fillRect(0, 0, m.width * s, m.height * s);

    for (let y = 0; y < m.height; y++) {
      const row = m.cells[y];
      for (let x = 0; x < m.width; x++) {
        this.drawBeadCell(ctx, x, y, s, m.colors[row[x]]);
      }
    }

    // 每 10 格参考线（拼豆板习惯）
    if (s >= 8) {
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 10; x < m.width; x += 10) {
        ctx.moveTo(x * s + 0.5, 0);
        ctx.lineTo(x * s + 0.5, m.height * s);
      }
      for (let y = 10; y < m.height; y += 10) {
        ctx.moveTo(0, y * s + 0.5);
        ctx.lineTo(m.width * s, y * s + 0.5);
      }
      ctx.stroke();
    }
  }

  /** 单个拼豆单元（供全量渲染与画笔增量重绘共用） */
  drawBeadCell(ctx, x, y, s, color) {
    const r = s * 0.44;
    const holeR = Math.max(1, s * 0.10);
    const [cr, cg, cb] = color.rgb;
    const cx = x * s + s / 2;
    const cy = y * s + s / 2;

    const grad = ctx.createRadialGradient(
      cx - r * 0.3, cy - r * 0.35, r * 0.1,
      cx, cy, r
    );
    const lighten = this.mixColor(cr, cg, cb, 255, 255, 255, 0.28);
    const darken = this.mixColor(cr, cg, cb, 0, 0, 0, 0.32);
    grad.addColorStop(0, lighten);
    grad.addColorStop(0.55, color.hex);
    grad.addColorStop(1, darken);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 中心孔
    ctx.fillStyle = 'rgba(0,0,0,0.34)';
    ctx.beginPath();
    ctx.arc(cx, cy, holeR, 0, Math.PI * 2);
    ctx.fill();

    // 左上高光
    if (s >= 6) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.42, cy - r * 0.42, Math.max(0.8, r * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 图片/网格/编号模式底图 */
  renderPixels(ctx, m, s) {
    for (let y = 0; y < m.height; y++) {
      const row = m.cells[y];
      for (let x = 0; x < m.width; x++) {
        ctx.fillStyle = m.colors[row[x]].hex;
        ctx.fillRect(x * s, y * s, s, s);
      }
    }
  }

  drawGridLines(ctx, m, s, strongRefLines) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 1; x < m.width; x++) {
      ctx.moveTo(x * s, 0);
      ctx.lineTo(x * s, m.height * s);
    }
    for (let y = 1; y < m.height; y++) {
      ctx.moveTo(0, y * s);
      ctx.lineTo(m.width * s, y * s);
    }
    ctx.stroke();

    if (strongRefLines && s >= 6) {
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 10; x < m.width; x += 10) {
        ctx.moveTo(x * s + 0.5, 0);
        ctx.lineTo(x * s + 0.5, m.height * s);
      }
      for (let y = 10; y < m.height; y += 10) {
        ctx.moveTo(0, y * s + 0.5);
        ctx.lineTo(m.width * s, y * s + 0.5);
      }
      ctx.stroke();
    }
  }

  drawNumbers(ctx, m, s) {
    const fontSize = Math.max(6, s * 0.42);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let y = 0; y < m.height; y++) {
      const row = m.cells[y];
      for (let x = 0; x < m.width; x++) {
        this.drawCellNumber(ctx, x, y, s, m.colors[row[x]]);
      }
    }
  }

  drawCellNumber(ctx, x, y, s, color) {
    const fontSize = Math.max(6, s * 0.42);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const [r, g, b] = color.rgb;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    ctx.fillStyle = lum > 140 ? '#1A1A1A' : '#FFFFFF';
    ctx.fillText(
      String(color.index).padStart(2, '0'),
      x * s + s / 2,
      y * s + s / 2 + 0.5
    );
  }

  // ---------- 画笔 ----------

  /** 构建编号调色板（与 colors[] 一一对应，下标即数组下标） */
  buildBrushPalette() {
    if (!this.brushPaletteEl || !this.matrix) return;
    this.brushPaletteEl.innerHTML = '';

    this.matrix.colors.forEach((color, idx) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'brush-chip' + (idx === this.brushColorIndex ? ' active' : '');
      chip.title = `${color.index}. ${color.code} · ${color.name}`;
      chip.dataset.idx = String(idx);
      chip.innerHTML =
        `<span class="brush-swatch" style="background-color:${color.hex}">` +
        `<span class="brush-num">${String(color.index).padStart(2, '0')}</span></span>` +
        `<span class="brush-name">${color.name}</span>`;
      chip.addEventListener('click', () => this.setBrushColor(idx));
      this.brushPaletteEl.appendChild(chip);
    });
    this.refreshBrushSelection();
  }

  refreshBrushSelection() {
    if (!this.brushPaletteEl) return;
    this.brushPaletteEl.querySelectorAll('.brush-chip').forEach(chip => {
      chip.classList.toggle('active', parseInt(chip.dataset.idx, 10) === this.brushColorIndex);
    });
  }

  setBrushColor(idx) {
    if (!this.matrix || idx < 0 || idx >= this.matrix.colors.length) return;
    this.brushColorIndex = idx;
    this.refreshBrushSelection();
  }

  setBrushSize(size) {
    this.brushSize = Math.max(1, Math.min(3, parseInt(size, 10) || 1));
  }

  toggleBrush(force) {
    this.brushMode = (force === undefined) ? !this.brushMode : force;
    if (!this.matrix) this.brushMode = false;

    if (this.brushTool) this.brushTool.classList.toggle('hidden', !this.brushMode);
    if (this.brushToggleBtn) {
      this.brushToggleBtn.classList.toggle('active', this.brushMode);
      this.brushToggleBtn.textContent = this.brushMode ? '✏️ 退出画笔' : '✏️ 画笔修改';
    }
    this.canvas.style.cursor = this.brushMode ? 'crosshair' : 'default';
  }

  cellAt(clientX, clientY) {
    if (!this.matrix) return null;
    const rect = this.canvas.getBoundingClientRect();
    const s = this.cellPx();
    const x = Math.floor((clientX - rect.left) / s);
    const y = Math.floor((clientY - rect.top) / s);
    if (x < 0 || y < 0 || x >= this.matrix.width || y >= this.matrix.height) return null;
    return { x, y };
  }

  applyBrush(cx, cy) {
    if (!this.matrix) return;
    const W = this.matrix.width;
    const H = this.matrix.height;
    const r = this.brushSize - 1; // size1->0, 2->1, 3->2
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (this.matrix.cells[y][x] === this.brushColorIndex) continue;
        const key = x + ',' + y;
        if (!(key in this.strokeOld)) this.strokeOld[key] = this.matrix.cells[y][x];
        this.matrix.cells[y][x] = this.brushColorIndex;
        this.pendingChanges.set(key, this.brushColorIndex);
        this.drawCell(x, y);
      }
    }
  }

  /** 增量重绘单个格子（用于画笔拖拽时实时反馈，避免整图重绘卡顿） */
  drawCell(x, y) {
    if (!this.matrix) return;
    const m = this.matrix;
    const s = this.cellPx();
    const color = m.colors[m.cells[y][x]];
    const ctx = this.ctx;

    if (this.viewMode === 'bead') {
      this.drawBeadCell(ctx, x, y, s, color);
    } else {
      ctx.fillStyle = color.hex;
      ctx.fillRect(x * s, y * s, s, s);
      if (this.viewMode === 'number' && s >= 7) {
        this.drawCellNumber(ctx, x, y, s, color);
      }
    }
  }

  onPointerDown(e) {
    if (!this.brushMode || !this.matrix) return;
    e.preventDefault();
    this.isPainting = true;
    this.pendingChanges.clear();
    this.strokeOld = {};
    if (this.canvas.setPointerCapture) {
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell) this.applyBrush(cell.x, cell.y);
  }

  onPointerMove(e) {
    if (!this.isPainting) return;
    const cell = this.cellAt(e.clientX, e.clientY);
    if (cell) this.applyBrush(cell.x, cell.y);
  }

  onPointerUp() {
    if (!this.isPainting) return;
    this.isPainting = false;
    // 全量重绘以恢复参考线/网格（增量绘制可能覆盖它们）
    this.render();
    if (this.pendingChanges.size > 0 && typeof this.onPaintBatch === 'function') {
      const changes = Array.from(this.pendingChanges.entries()).map(([k, c]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, c };
      });
      // 记录本笔用于回退
      const stroke = Object.entries(this.strokeOld).map(([k, old]) => {
        const [x, y] = k.split(',').map(Number);
        return { x, y, old };
      });
      if (stroke.length > 0) {
        this.undoStack.push(stroke);
        this.updateUndoBtn();
      }
      this.onPaintBatch(changes);
    }
    this.pendingChanges.clear();
  }

  /** 撤销最近一次画笔修改（可多次回退） */
  undo() {
    if (!this.matrix || this.undoStack.length === 0) return;
    const stroke = this.undoStack.pop();
    const changes = stroke.map(({ x, y, old }) => {
      this.matrix.cells[y][x] = old;
      return { x, y, c: old };
    });
    this.render();
    this.updateUndoBtn();
    if (changes.length > 0 && typeof this.onPaintBatch === 'function') {
      this.onPaintBatch(changes);
    }
  }

  updateUndoBtn() {
    if (this.undoBtn) this.undoBtn.disabled = this.undoStack.length === 0;
  }

  mixColor(r1, g1, b1, r2, g2, b2, t) {
    return `rgb(${Math.round(r1 + (r2 - r1) * t)},${Math.round(g1 + (g2 - g1) * t)},${Math.round(b1 + (b2 - b1) * t)})`;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.matrix = null;
    this.undoStack = [];
    this.updateUndoBtn();
    this.toggleBrush(false);
    if (this.brushToggleBtn) this.brushToggleBtn.disabled = true;
  }
}
