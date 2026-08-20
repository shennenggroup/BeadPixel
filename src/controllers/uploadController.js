const sharp = require('sharp');
const path = require('path');

/**
 * 上传图片
 */
exports.uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传图片文件'
      });
    }

    const filePath = req.file.path;
    const metadata = await sharp(filePath).metadata();

    res.json({
      success: true,
      imageId: path.basename(req.file.filename, path.extname(req.file.filename)),
      originalName: req.file.originalname,
      width: metadata.width,
      height: metadata.height,
      url: `/uploads/${req.file.filename}`
    });
  } catch (err) {
    console.error('上传失败:', err);
    res.status(500).json({
      success: false,
      message: '上传失败',
      error: err.message
    });
  }
};
