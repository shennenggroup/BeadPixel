const express = require('express');
const router = express.Router();

const uploadRoutes = require('./upload');
const processRoutes = require('./process');
const exportRoutes = require('./export');
const historyRoutes = require('./history');

// 色板查询
const path = require('path');
const fs = require('fs');

router.get('/colors/:brand', (req, res) => {
  const brand = req.params.brand;
  const validBrands = ['perler', 'artkal', 'hama'];

  if (!validBrands.includes(brand)) {
    return res.status(400).json({
      success: false,
      message: `不支持的品牌: ${brand}，可选: ${validBrands.join(', ')}`
    });
  }

  const filePath = path.join(__dirname, '..', 'data', 'beadColors', `${brand}.json`);
  try {
    const colors = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    res.json({ success: true, brand, colors });
  } catch (err) {
    res.status(500).json({ success: false, message: '读取色板数据失败' });
  }
});

// 挂载子路由
router.use('/upload', uploadRoutes);
router.use('/process', processRoutes);
router.use('/export', exportRoutes);
router.use('/history', historyRoutes);

module.exports = router;
