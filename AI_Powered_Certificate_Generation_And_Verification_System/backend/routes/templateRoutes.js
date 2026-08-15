const express = require('express');
const router = express.Router();
const { getAllTemplates, createTemplate, updateTemplate, deleteTemplate } = require('../controllers/templateController');

router.get('/', getAllTemplates);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

module.exports = router;
