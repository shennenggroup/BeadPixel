const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');

router.get('/', historyController.list);
router.delete('/:resultId', historyController.delete);
router.put('/:resultId/name', historyController.rename);

module.exports = router;
