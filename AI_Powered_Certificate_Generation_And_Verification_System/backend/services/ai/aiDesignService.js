const { getTemplatesCol } = require('../../config/db');
const { templateScope, scoped } = require('../../utils/tenant');
const { buildPrompt } = require('./aiPromptBuilder');
const { FIELD_TYPES, DesignValidationError, validateResponse } = require('./aiSchema');
const { generateDesign } = require('./aiProvider');

const META_KEYS = ['name', 'style', 'category', 'primary_color', 'secondary_color', 'background_color',
  'border_style', 'border_width', 'corner_radius', 'accent_ring', 'gradient_enabled', 'gradient_from',
  'gradient_to', 'gradient_angle', 'watermark_text', 'watermark_color', 'watermark_opacity',
  'watermark_size', 'issuer_name', 'issuer_title'];
const FIELD_KEYS = ['id', 'type', 'x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight',
  'fontStyle', 'color', 'textAlign', 'letterSpacing', 'lineHeight', 'visible', 'text', 'label',
  'lineColor', 'lineThickness'];

function compactTemplate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !Array.isArray(input.fields) || input.fields.length > 60) {
    throw new DesignValidationError('Invalid template context');
  }
  const template = {};
  if (input.id !== null && input.id !== undefined) {
    if (typeof input.id !== 'string' || input.id.length > 128) throw new DesignValidationError('Invalid template ID');
    template.id = input.id;
  }
  for (const key of META_KEYS) {
    const value = input[key];
    if (typeof value === 'string') template[key] = value.slice(0, 180);
    else if (typeof value === 'number' && Number.isFinite(value)) template[key] = value;
    else if (typeof value === 'boolean') template[key] = value;
  }
  template.fields = input.fields.map(f => {
    if (!f || !FIELD_TYPES.has(f.type) || typeof f.id !== 'string' || f.id.length > 80) {
      throw new DesignValidationError('Invalid template field');
    }
    const out = {};
    for (const key of FIELD_KEYS) {
      const value = f[key];
      if (typeof value === 'string') out[key] = value.slice(0, key === 'text' ? 600 : 100);
      else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value;
      else if (typeof value === 'boolean') out[key] = value;
    }
    if (f.type === 'logo_image' || f.type === 'signature_image') out.has_image = !!f.has_image;
    return out;
  });
  return template;
}

function parseRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new DesignValidationError('Invalid request');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > 1200) {
    throw new DesignValidationError('Describe your design in 1–1200 characters');
  }
  const template = compactTemplate(body.template);
  const conversation = body.conversation || [];
  if (!Array.isArray(conversation) || conversation.length > 8) throw new DesignValidationError('Conversation is too long');
  const cleanConversation = conversation.map(m => {
    if (!m || !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' || m.content.length > 360) {
      throw new DesignValidationError('Invalid conversation');
    }
    return { role: m.role, content: m.content };
  });
  return { prompt: body.prompt.trim(), template, conversation: cleanConversation };
}

async function design({ body, req, provider = generateDesign, signal }) {
  const input = parseRequest(body);
  if (input.template.id) {
    const permitted = await getTemplatesCol().findOne(
      scoped({ id: input.template.id }, templateScope(req)), { projection: { _id: 0, id: 1 } }
    );
    if (!permitted) {
      const error = new Error('Template not found in this organization');
      error.statusCode = 404;
      throw error;
    }
  }
  const { system, user } = buildPrompt(input);
  const started = Date.now();
  try {
    let proposal;
    for (let attempt = 0; attempt < 2; attempt++) {
      const correction = attempt ? '\nIMPORTANT: Your previous response failed strict design validation. ' +
        'Follow the allowed schema, use only supported field types and valid values, ' +
        'and ensure all operations reference existing fields (except add_field). Return ONLY corrected JSON.' : '';
      const output = await provider({ system: system + correction, user, signal });
      try {
        proposal = validateResponse(output, input.template);
        break;
      } catch (err) {
        if (!(err instanceof DesignValidationError) || attempt) throw err;
        console.warn('[AI design]', { status: 'retry_invalid_output', validation_reason: err.message });
      }
    }
    const count = proposal.variants ? proposal.variants.reduce((n, v) => n + v.design.field_operations.length, 0)
      : proposal.field_operations.length;
    console.info('[AI design]', { provider: process.env.AI_PROVIDER || 'gemini', status: 'valid',
      latency_ms: Date.now() - started, operation_count: count });
    return proposal;
  } catch (err) {
    console.warn('[AI design]', { provider: process.env.AI_PROVIDER || 'gemini',
      status: err instanceof DesignValidationError ? 'invalid_output' : 'provider_error',
      error_type: err.name, validation_reason: err instanceof DesignValidationError ? err.message : undefined,
      latency_ms: Date.now() - started });
    throw err;
  }
}

module.exports = { compactTemplate, parseRequest, design };