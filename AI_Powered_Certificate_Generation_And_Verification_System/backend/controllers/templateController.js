const { getTemplatesCol } = require('../config/db');
const { uuidv4 } = require('../utils/helpers');
const {
  renderCertificatePdfBuffer,
  sampleCertificateValues
} = require('../modules/bulkGeneration/certificateRenderer');

// Template keys the API accepts, with the default applied on create.
// Anything not listed here is ignored, so clients cannot inject arbitrary keys.
const TEMPLATE_DEFAULTS = {
  name: 'Custom Template',
  style: 'modern',
  description: '',
  category: 'General',
  tags: [],
  primary_color: '#2563eb',
  secondary_color: '#06b6d4',
  // Border
  border_style: 'double',
  border_width: 4,
  corner_radius: 0,
  accent_ring: true,
  // Background
  background_color: '#ffffff',
  background_image: '',
  background_fit: 'stretch',
  background_opacity: 1,
  gradient_enabled: false,
  gradient_from: '#ffffff',
  gradient_to: '#e2e8f0',
  gradient_angle: 90,
  // Watermark
  watermark_text: '',
  watermark_color: '#94a3b8',
  watermark_opacity: 0.08,
  watermark_size: 72,
  // Signature block
  issuer_name: 'Dean of Academic Affairs',
  issuer_title: 'University Chancellor',
  fields: []
};

const TEMPLATE_KEYS = Object.keys(TEMPLATE_DEFAULTS);

function coerce(key, value) {
  if (key === 'tags') return Array.isArray(value) ? value.map(String) : [];
  if (key === 'fields') return Array.isArray(value) ? value : [];
  return value;
}

/**
 * Builds a full template document, filling every whitelisted key with its default.
 * Used on create.
 */
function normalizeTemplate(body = {}) {
  const out = {};
  for (const key of TEMPLATE_KEYS) {
    out[key] = body[key] === undefined ? TEMPLATE_DEFAULTS[key] : coerce(key, body[key]);
  }
  return out;
}

/**
 * Builds a partial update containing only the whitelisted keys the caller sent,
 * so a request that omits a key leaves the stored value alone.
 */
function templatePatch(body = {}) {
  const patch = {};
  for (const key of TEMPLATE_KEYS) {
    if (body[key] !== undefined) patch[key] = coerce(key, body[key]);
  }
  return patch;
}

// GET /api/templates
async function getAllTemplates(req, res) {
  try {
    const templates = await getTemplatesCol().find({}, { projection: { _id: 0 } }).toArray();
    res.json(templates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/templates/:id
async function getTemplateById(req, res) {
  try {
    const template = await getTemplatesCol().findOne({ id: req.params.id }, { projection: { _id: 0 } });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json(template);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/templates
async function createTemplate(req, res) {
  try {
    const template = {
      id: uuidv4(),
      ...normalizeTemplate(req.body),
      created_at: new Date().toISOString()
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
    const patch = templatePatch(req.body);
    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'No updatable template fields provided' });
    }
    patch.updated_at = new Date().toISOString();

    const result = await getTemplatesCol().findOneAndUpdate(
      { id: req.params.id },
      { $set: patch },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    const updated = result && (result.value !== undefined ? result.value : result);
    if (!updated) return res.status(404).json({ error: 'Template not found' });

    res.json({ message: 'Template updated successfully', template: updated });
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

// POST /api/templates/preview-pdf
// Renders an arbitrary (possibly unsaved) template with sample data. Powers the
// Design Studio's "Preview PDF" button, so nothing has to be saved to be checked.
async function previewTemplatePdf(req, res) {
  try {
    const template = normalizeTemplate(req.body || {});
    const values = sampleCertificateValues(req.body && req.body.sample_values);
    const buffer = await renderCertificatePdfBuffer(template, values);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=template-preview.pdf');
    res.setHeader('Content-Length', buffer.length);
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplatePdf,
  normalizeTemplate,
  TEMPLATE_DEFAULTS
};
