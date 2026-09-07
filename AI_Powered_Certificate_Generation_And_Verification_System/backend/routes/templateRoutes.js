const express = require('express');
const router = express.Router();
const {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplatePdf
} = require('../controllers/templateController');

router.get('/', getAllTemplates);
router.post('/', createTemplate);
// Must precede '/:id' so the param route does not swallow it.
router.post('/preview-pdf', previewTemplatePdf);
router.get('/:id', getTemplateById);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
