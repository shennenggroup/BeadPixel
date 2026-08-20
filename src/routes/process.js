const express = require('express');
const router = express.Router();
const processController = require('../controllers/processController');

// 像素化处理
router.post('/pixelate', processController.pixelate);

// 快速预览（返回 base64）
router.post('/preview', processController.preview);

module.exports = router;
