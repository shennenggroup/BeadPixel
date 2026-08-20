/**
 * 导出功能组件（重构版）
 *
 * 导出全部基于后端持久化的拼豆矩阵：
 *   PNG - style(bead/pixel) + scale + grid
 *   PDF - pageSize + grid + numbers + splitPages
 *   CSV - includeGrid
 */

class Exporter {
  constructor() {
    this.exportPNGBtn = document.getElementById('exportPNGBtn');
    this.exportPDFBtn = document.getElementById('exportPDFBtn');
    this.exportCSVBtn = document.getElementById('exportCSVBtn');

    this.exportStyle = document.getElementById('exportStyle');
    this.exportGrid = document.getElementById('exportGrid');
    this.exportNumbers = document.getElementById('exportNumbers');
    this.exportScale = document.getElementById('exportScale');
    this.pdfGrid = document.getElementById('pdfGrid');
    this.pdfNumbers = document.getElementById('pdfNumbers');
    this.pdfSplit = document.getElementById('pdfSplit');
    this.pdfPageSize = document.getElementById('pdfPageSize');
    this.csvGrid = document.getElementById('csvGrid');

    this.currentResultId = null;

    this.init();
  }

  init() {
    this.exportPNGBtn.addEventListener('click', () => this.exportPNG());
    this.exportPDFBtn.addEventListener('click', () => this.exportPDF());
    this.exportCSVBtn.addEventListener('click', () => this.exportCSV());
  }

  setResultId(resultId) {
    this.currentResultId = resultId;
  }

  async exportPNG() {
    if (!this.currentResultId) {
      this.showToast('请先生成拼豆图', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/export/png', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId: this.currentResultId,
          style: this.exportStyle.value,
          showGrid: this.exportGrid.checked,
          showNumbers: this.exportNumbers.checked,
          scale: parseInt(this.exportScale.value) || 14
        })
      });

      if (!response.ok) throw new Error('导出失败');

      const blob = await response.blob();
      this.downloadBlob(blob, `beadpixel-${this.currentResultId}.png`);
      this.showToast('PNG 导出成功', 'success');
    } catch (error) {
      console.error('导出 PNG 失败:', error);
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  async exportPDF() {
    if (!this.currentResultId) {
      this.showToast('请先生成拼豆图', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId: this.currentResultId,
          pageSize: this.pdfPageSize.value,
          showGrid: this.pdfGrid.checked,
          showNumbers: this.pdfNumbers.checked,
          splitPages: this.pdfSplit.checked
        })
      });

      if (!response.ok) throw new Error('导出失败');

      const blob = await response.blob();
      this.downloadBlob(blob, `beadpixel-${this.currentResultId}.pdf`);
      this.showToast('PDF 图纸导出成功', 'success');
    } catch (error) {
      console.error('导出 PDF 失败:', error);
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  async exportCSV() {
    if (!this.currentResultId) {
      this.showToast('请先生成拼豆图', 'warning');
      return;
    }

    try {
      const response = await fetch('/api/export/csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resultId: this.currentResultId,
          includeGrid: this.csvGrid.checked
        })
      });

      if (!response.ok) throw new Error('导出失败');

      const blob = await response.blob();
      this.downloadBlob(blob, `beadpixel-${this.currentResultId}-colors.csv`);
      this.showToast('CSV 导出成功', 'success');
    } catch (error) {
      console.error('导出 CSV 失败:', error);
      this.showToast('导出失败: ' + error.message, 'error');
    }
  }

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
}
