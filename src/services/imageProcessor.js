/**
 * 图片处理核心服务（重构版）
 *
 * 旧版流程（resize → RGB 量化 → 映射拼豆）已被 beadEngine 取代。
 * 本类保留原有对外形态（ImageProcessor.pixelate），
 * 内部委托给拼豆核心引擎，返回统一的拼豆矩阵。
 */

const sharp = require('sharp');
const { BeadEngine } = require('./beadEngine');
const { renderMatrix } = require('./beadRenderer');

class ImageProcessor {
  constructor() {
    this.engine = new BeadEngine();
  }

  /**
   * 生成拼豆矩阵（核心入口）
   * @returns {Object} 拼豆矩阵 {width, height, cells, colors, totalBeads, meta}
   */
  async generate(imagePath, options) {
    return this.engine.generate(imagePath, options);
  }

  /**
   * 兼容旧接口：pixelate
   * 返回 { buffer, width, height, colorStats, matrix }
   * （buffer 为拼豆风格预览图；colorStats 即矩阵 colors）
   */
  async pixelate(imagePath, options = {}) {
    const matrix = await this.engine.generate(imagePath, options);
    const buffer = await renderMatrix(matrix, {
      style: 'bead',
      scale: options.previewScale || 12,
      showGrid: true,
      maxWidth: 900
    });
    return {
      buffer,
      width: matrix.width,
      height: matrix.height,
      colorStats: matrix.colors,
      matrix
    };
  }
}

module.exports = ImageProcessor;
