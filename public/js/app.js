/**
 * 主应用逻辑（重构版）
 *
 * 前后端围绕【拼豆矩阵】协作：
 *   后端返回 matrix（真实拼豆色号 + 编号 + 数量），
 *   前端基于 matrix 渲染四种视图与颜色统计，
 *   导出只传 resultId，后端从持久化矩阵生成 PNG/PDF/CSV。
 *
 * 页面流程：上传 → 生成/调整 → 导出（顶部步骤指示，无导航链接）
 */

class App {
  constructor() {
    this.uploader = new Uploader();
    this.preview = new Preview();
    this.colorPanel = new ColorPanel();
    this.exporter = new Exporter();
    this.history = new History();

    this.currentImageId = null;
    this.currentResultId = null;
    this.currentMatrix = null;

    this.init();
  }

  init() {
    this.initSectionFlow();
    this.initControls();
    this.initSidebar();
    this.initHelpModal();

    this.uploader.onUploadSuccess = (result) => this.handleUploadSuccess(result);

    this.preview.onPaintBatch = (changes) => this.persistBrushChanges(changes);

    this.history.onLoad = (record) => this.loadHistoryRecord(record);

    document.getElementById('processBtn').addEventListener('click', () => this.processImage());
    document.getElementById('goExportBtn').addEventListener('click', () => this.showSection('export'));
    document.getElementById('backToUploadBtn').addEventListener('click', () => this.showSection('upload'));
    document.getElementById('backToPreviewBtn').addEventListener('click', () => this.showSection('preview'));
  }

  /** 右侧侧边栏折叠/展开 */
  initSidebar() {
    const btn = document.getElementById('sideToggleBtn');
    const panel = document.getElementById('sidePanel');
    if (!btn || !panel) return;
    btn.addEventListener('click', () => {
      const collapsed = panel.classList.toggle('collapsed');
      btn.textContent = collapsed ? '‹ 展开侧栏' : '› 收起侧栏';
      // 侧栏收起/展开后画布可用宽度变化，重新适配
      if (this.preview && this.preview.matrix) {
        this.preview.fitZoom();
        this.preview.render();
      }
    });
  }

  // ---------- 页面流程 ----------

  /** 切换显示的 section，并更新顶部步骤指示 */
  showSection(name) {
    const map = { upload: 'upload-section', preview: 'preview-section', export: 'export-section' };
    const targetId = map[name];
    if (!targetId) return;

    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
      section.classList.add('hidden');
    });
    const target = document.getElementById(targetId);
    target.classList.remove('hidden');
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 步骤指示状态
    const order = ['upload', 'preview', 'export'];
    const currentIdx = order.indexOf(name);
    ['upload', 'preview', 'export'].forEach((step, idx) => {
      const el = document.getElementById(`step${step[0].toUpperCase()}${step.slice(1)}`);
      if (!el) return;
      el.classList.toggle('active', idx === currentIdx);
      el.classList.toggle('done', idx < currentIdx);
    });
  }

  initSectionFlow() {
    this.showSection('upload');
  }

  // ---------- 帮助弹窗 ----------

  initHelpModal() {
    const modal = document.getElementById('helpModal');
    document.getElementById('helpOpenBtn').addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
    document.getElementById('helpCloseBtn').addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    // 点击遮罩关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
    // Esc 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') modal.classList.add('hidden');
    });
  }

  // ---------- 参数控件 ----------

  initControls() {
    // 网格预设
    const gridWidth = document.getElementById('gridWidth');
    const gridHeight = document.getElementById('gridHeight');

    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        gridWidth.value = btn.dataset.gw;
        gridHeight.value = btn.dataset.gh;
        this.updatePhysicalHint();
      });
    });

    // 手动修改网格时取消预设高亮
    const onGridChange = () => {
      document.querySelectorAll('.preset-btn').forEach(b => {
        b.classList.toggle('active',
          b.dataset.gw === gridWidth.value && b.dataset.gh === gridHeight.value);
      });
      this.updatePhysicalHint();
    };
    gridWidth.addEventListener('input', onGridChange);
    gridHeight.addEventListener('input', onGridChange);
    document.getElementById('beadSizeMm').addEventListener('change', () => this.updatePhysicalHint());

    this.updatePhysicalHint();
  }

  updatePhysicalHint() {
    const gw = parseInt(document.getElementById('gridWidth').value) || 32;
    const gh = parseInt(document.getElementById('gridHeight').value) || 32;
    const mm = parseFloat(document.getElementById('beadSizeMm').value) || 5;
    const hint = document.getElementById('physicalSizeHint');
    hint.textContent = `实际尺寸约 ${(gw * mm / 10).toFixed(1)} × ${(gh * mm / 10).toFixed(1)} cm`;
  }

  // ---------- 主流程 ----------

  handleUploadSuccess(result) {
    this.currentImageId = result.imageId;
    this.preview.setOriginalImage(result.url);
    this.showSection('preview');
    this.showToast('图片上传成功，调整参数后点击"生成拼豆图"', 'success');
  }

  collectParams() {
    return {
      imageId: this.currentImageId,
      gridWidth: parseInt(document.getElementById('gridWidth').value) || 32,
      gridHeight: parseInt(document.getElementById('gridHeight').value) || 32,
      colorLimit: document.getElementById('colorLimit').value,
      dithering: document.getElementById('dithering').value,
      fitMode: document.getElementById('fitMode').value,
      background: document.getElementById('backgroundColor').value,
      beadBrand: document.getElementById('beadBrand').value,
      beadSizeMm: parseFloat(document.getElementById('beadSizeMm').value) || 5,
      detailPriority: document.getElementById('detailPriority').value === 'true'
    };
  }

  async processImage() {
    if (!this.currentImageId) {
      this.showToast('请先上传图片', 'warning');
      return;
    }

    this.showLoading();

    try {
      const params = this.collectParams();
      const response = await fetch('/api/process/pixelate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const result = await response.json();

      if (result.success) {
        this.currentResultId = result.resultId;
        this.currentMatrix = result.matrix;
        this.exporter.setResultId(result.resultId);

        // 前端基于拼豆矩阵本地渲染
        this.preview.setMatrix(result.matrix);

        // 颜色统计（真实拼豆色号 + 编号 + 数量）
        this.colorPanel.show(result.matrix.colors, result.matrix.totalBeads);

        // 摘要
        const meta = result.matrix.meta;
        document.getElementById('matrixSummary').innerHTML =
          `<strong>${result.matrix.width} × ${result.matrix.height}</strong> 颗拼豆` +
          `（${meta.physicalWidthCm} × ${meta.physicalHeightCm} cm）` +
          ` · <strong>${result.matrix.colors.length}</strong> 种颜色` +
          ` · ${meta.brandName}色板` +
          ` · 共 <strong>${result.matrix.totalBeads}</strong> 颗`;

        // 启用导出入口
        document.getElementById('goExportBtn').disabled = false;

        this.showToast('拼豆图生成完成', 'success');
      } else {
        throw new Error(result.message || '处理失败');
      }
    } catch (error) {
      console.error('处理失败:', error);
      this.showToast('处理失败: ' + error.message, 'error');
    } finally {
      this.hideLoading();
    }
  }

  showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
  }

  hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  /** 画笔修改上报后端并持久化，再刷新颜色统计 */
  async persistBrushChanges(changes) {
    if (!this.currentResultId || !Array.isArray(changes) || changes.length === 0) return;
    try {
      const response = await fetch(`/api/export/matrix/${this.currentResultId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes })
      });
      const data = await response.json();
      if (data.success && Array.isArray(data.colors)) {
        // preview.matrix 与 currentMatrix 是同一引用，直接更新计数即可
        this.currentMatrix.colors = data.colors;
        this.colorPanel.show(data.colors, this.currentMatrix.totalBeads);
        if (data.applied > 0) {
          this.showToast(`已修改 ${data.applied} 颗拼豆并保存`, 'success');
        }
      } else if (!data.success) {
        this.showToast('保存修改失败: ' + (data.message || '未知错误'), 'error');
      }
      } catch (err) {
        console.error('保存画笔修改失败:', err);
        this.showToast('保存修改失败: ' + err.message, 'error');
      }
    }

    /** 从「历史记录」加载一条记录回到预览区 */
    async loadHistoryRecord(record) {
      try {
        const response = await fetch(`/api/export/matrix/${record.resultId}`);
        const data = await response.json();
        if (!data.success) throw new Error(data.message || '加载失败');

        this.currentImageId = record.imageId || null;
        this.currentResultId = record.resultId;
        this.currentMatrix = data.matrix;
        this.exporter.setResultId(record.resultId);

        this.preview.setOriginalImage(record.imageUrl);
        this.preview.setMatrix(data.matrix);
        this.colorPanel.show(data.matrix.colors, data.matrix.totalBeads);

        const meta = data.matrix.meta;
        document.getElementById('matrixSummary').innerHTML =
          `<strong>${data.matrix.width} × ${data.matrix.height}</strong> 颗拼豆` +
          `（${meta.physicalWidthCm} × ${meta.physicalHeightCm} cm）` +
          ` · <strong>${data.matrix.colors.length}</strong> 种颜色` +
          ` · ${meta.brandName}色板` +
          ` · 共 <strong>${data.matrix.totalBeads}</strong> 颗`;

        document.getElementById('goExportBtn').disabled = false;
        this.showSection('preview');
        this.showToast('已加载历史记录', 'success');
      } catch (err) {
        console.error('加载历史记录失败:', err);
        this.showToast('加载失败: ' + err.message, 'error');
      }
    }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});
