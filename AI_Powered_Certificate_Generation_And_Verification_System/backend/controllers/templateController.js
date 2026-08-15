const { getTemplatesCol } = require('../config/db');
const { uuidv4 } = require('../utils/helpers');

// GET /api/templates
async function getAllTemplates(req, res) {
  try {
    const templates = await getTemplatesCol().find({}, { projection: { _id: 0 } }).toArray();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/templates
async function createTemplate(req, res) {
  try {
    const template = {
      id: uuidv4(),
      name: req.body.name || 'Custom Template',
      style: req.body.style || 'modern',
      primary_color: req.body.primary_color || '#2563eb',
      secondary_color: req.body.secondary_color || '#06b6d4',
      border_style: req.body.border_style || 'double',
      issuer_name: req.body.issuer_name || 'Dean of Academic Affairs',
      issuer_title: req.body.issuer_title || 'University Chancellor',
      background_image: req.body.background_image || '',
      fields: req.body.fields || []
    };
    await getTemplatesCol().insertOne(template);
    const { _id, ...cleanTpl } = template;
    res.json({ message: 'Template created successfully', template: cleanTpl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// PUT /api/templates/:id
async function updateTemplate(req, res) {
  try {
    const updateData = {
      name: req.body.name,
      style: req.body.style,
      primary_color: req.body.primary_color,
      secondary_color: req.body.secondary_color,
      border_style: req.body.border_style,
      issuer_name: req.body.issuer_name,
      issuer_title: req.body.issuer_title,
      background_image: req.body.background_image,
      fields: req.body.fields
    };
    const result = await getTemplatesCol().updateOne({ id: req.params.id }, { $set: updateData });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template updated successfully', template: { id: req.params.id, ...updateData } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/templates/:id
async function deleteTemplate(req, res) {
  try {
    const result = await getTemplatesCol().deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ message: 'Template deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAllTemplates, createTemplate, updateTemplate, deleteTemplate };
