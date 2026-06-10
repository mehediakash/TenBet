const express = require('express');
const cmsController = require('../controllers/cmsController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Public routes
router.get('/content/:type', cmsController.getContentByType);

// Admin routes
router.use(protect);
router.use(authorize('admin'));

router.post('/content', cmsController.createContent);
router.get('/content', cmsController.getAllContent);
router.put('/content/:contentId', cmsController.updateContent);
router.delete('/content/:contentId', cmsController.deleteContent);

module.exports = router;