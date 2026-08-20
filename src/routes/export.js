const express = require('express');
const router = express.Router();
const exportController = require('../controllers/exportController');

// 导出 PNG
router.post('/png', exportController.exportPNG);

// 导出 PDF
router.post('/pdf', exportController.exportPDF);

// 导出 CSV
router.post('/csv', exportController.exportCSV);

// 获取拼豆矩阵
router.get('/matrix/:resultId', exportController.getMatrix);

// 画笔修改：批量更新拼豆格颜色
router.post('/matrix/:resultId', exportController.updateMatrixCells);

module.exports = router;
