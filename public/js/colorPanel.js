/**
 * 颜色统计面板组件（重构版）
 *
 * 展示真实拼豆颜色：编号、色号、名称、色块、数量、占比。
 */

class ColorPanel {
  constructor() {
    this.container = document.getElementById('colorStats');
    this.colorList = document.getElementById('colorList');
  }

  show(colors, totalBeads) {
    this.container.classList.remove('hidden');
    this.render(colors, totalBeads || colors.reduce((s, c) => s + c.count, 0));
  }

  hide() {
    this.container.classList.add('hidden');
  }

  render(colors, total) {
    this.colorList.innerHTML = '';

    colors.forEach(color => {
      const item = document.createElement('div');
      item.className = 'color-item';
      item.title = `${color.name} (${color.code})`;

      const percentage = ((color.count / total) * 100).toFixed(1);
      const num = String(color.index).padStart(2, '0');

      item.innerHTML = `
        <div class="color-swatch" style="background-color: ${color.hex}"></div>
        <div class="color-info">
          <div class="color-name"><span class="color-num">${num}</span> ${color.code} · ${color.name}</div>
          <div class="color-count">${color.count} 颗 (${percentage}%) · ${color.hex}</div>
        </div>
      `;

      this.colorList.appendChild(item);
    });
  }
}
