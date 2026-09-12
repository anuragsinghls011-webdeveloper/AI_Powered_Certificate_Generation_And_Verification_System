const express = require('express');
const router = express.Router();
const { requirePermission } = require('../middleware/authMiddleware');
const { workLimit } = require('../services/workload');
const {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplatePdf
} = require('../controllers/templateController');

router.get('/', requirePermission('templates.read'), getAllTemplates);
router.post('/', requirePermission('templates.create'), createTemplate);
// Must precede '/:id' so the param route does not swallow it.
router.post('/preview-pdf', requirePermission('templates.create'), workLimit('pdf'), previewTemplatePdf);
router.get('/:id', requirePermission('templates.read'), getTemplateById);
router.put('/:id', requirePermission('templates.update'), updateTemplate);
router.delete('/:id', requirePermission('templates.delete'), deleteTemplate);

module.exports = router;
