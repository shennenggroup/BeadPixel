/**
 * 历史记录组件
 *
 * 打开弹窗列出历次生成的拼豆图，支持：
 *   - 加载：把该记录恢复到预览区（拼豆结果 + 原图 + 颜色统计），可继续导出
 *   - 重命名：修改显示名称
 *   - 删除：同时从后端清理矩阵与预览图文件
 *
 * 加载回调 onLoad(record) 由 App 注入。
 */

class History {
  constructor() {
    this.modal = document.getElementById('historyModal');
    this.listEl = document.getElementById('historyList');
    this.openBtn = document.getElementById('historyOpenBtn');
    this.closeBtn = document.getElementById('historyCloseBtn');
    this.onLoad = null; // (record) => {}

    this.init();
  }

  init() {
    if (this.openBtn) {
      this.openBtn.addEventListener('click', () => this.open());
    }
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) this.close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.modal.classList.contains('hidden')) this.close();
      });
    }
  }

  open() {
    this.modal.classList.remove('hidden');
    this.refresh();
  }

  close() {
    this.modal.classList.add('hidden');
  }

  async refresh() {
    try {
      const resp = await fetch('/api/history');
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || '加载失败');
      this.render(data.history || []);
    } catch (err) {
      if (this.listEl) {
        this.listEl.innerHTML = `<p class="history-empty">加载失败：${this.esc(err.message)}</p>`;
      }
    }
  }

  render(history) {
    if (!this.listEl) return;
    if (!history.length) {
      this.listEl.innerHTML = '<p class="history-empty">暂无历史记录，先去生成一张拼豆图吧～</p>';
      return;
    }
    this.listEl.innerHTML = '';
    history.forEach(rec => this.listEl.appendChild(this.renderItem(rec)));
  }

  renderItem(rec) {
    const item = document.createElement('div');
    item.className = 'history-item';

    const m = rec.meta || {};
    const p = rec.params || {};
    const time = rec.createdAt ? new Date(rec.createdAt).toLocaleString('zh-CN') : '';
    const paramText = [
      `${m.width || '?'}×${m.height || '?'}`,
      m.brandName || p.beadBrand || '',
      `${m.colorCount != null ? m.colorCount : '?'} 色`,
      p.dithering ? `抖动:${p.dithering}` : '',
      p.fitMode ? `适配:${p.fitMode}` : ''
    ].filter(Boolean).join(' · ');

    item.innerHTML = `
      <img class="history-thumb" src="/exports/${this.esc(rec.resultId)}.png" alt="缩略图" loading="lazy"
           onerror="this.style.visibility='hidden'">
      <div class="history-info">
        <div class="history-name" title="${this.esc(rec.name)}">${this.esc(rec.name)}</div>
        <div class="history-meta">${this.esc(paramText)}</div>
        <div class="history-time">${this.esc(time)}</div>
      </div>
      <div class="history-actions">
        <button class="btn btn-small btn-primary" data-act="load">加载</button>
        <button class="btn btn-small" data-act="rename">重命名</button>
        <button class="btn btn-small btn-danger" data-act="delete">删除</button>
      </div>
    `;

    item.querySelector('[data-act="load"]').addEventListener('click', () => {
      if (this.onLoad) this.onLoad(rec);
      this.close();
    });
    item.querySelector('[data-act="rename"]').addEventListener('click', () => this.rename(rec));
    item.querySelector('[data-act="delete"]').addEventListener('click', () => this.delete(rec));

    return item;
  }

  async rename(rec) {
    const name = window.prompt('请输入新的名称：', rec.name);
    if (name === null) return;
    try {
      const resp = await fetch(`/api/history/${encodeURIComponent(rec.resultId)}/name`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || '重命名失败');
      this.refresh();
    } catch (err) {
      window.alert('重命名失败：' + err.message);
    }
  }

  async delete(rec) {
    if (!window.confirm(`确定删除「${rec.name}」？该操作不可恢复。`)) return;
    try {
      const resp = await fetch(`/api/history/${encodeURIComponent(rec.resultId)}`, { method: 'DELETE' });
      const data = await resp.json();
      if (!data.success) throw new Error(data.message || '删除失败');
      this.refresh();
    } catch (err) {
      window.alert('删除失败：' + err.message);
    }
  }

  esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
}
