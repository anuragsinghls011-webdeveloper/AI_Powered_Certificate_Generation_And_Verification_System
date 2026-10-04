// Only these existing Design Studio properties may cross the model boundary.
const { DESIGN_W, DESIGN_H } = require('../../modules/bulkGeneration/certificateRenderer');

const FIELD_TYPES = new Set(['recipient_name', 'recipient_email', 'organization_name', 'rank', 'score',
  'event_title', 'issue_date', 'certificate_id', 'certificate_link', 'certificate_qr',
  'issuer_name', 'issuer_title', 'custom_text', 'text_block', 'signature_image', 'logo_image', 'divider']);
const FONT_FAMILIES = new Set(['Helvetica', 'Times-Roman', 'Courier', 'Montserrat', 'PlayfairDisplay',
  'GreatVibes', 'Oswald', 'Lato', 'Merriweather', 'Cinzel', 'Lora', 'AlexBrush']);
const INTENTS = new Set(['create', 'modify', 'improve', 'add', 'remove', 'rearrange', 'style', 'variation']);
const OPS = new Set(['add_field', 'update_field', 'remove_field', 'duplicate_field', 'move_field',
  'resize_field', 'restyle_field', 'reorder_layer']);
const TEMPLATE_RULES = {
  name: ['text', 100], style: ['enum', ['modern', 'classic', 'minimal']],
  category: ['enum', ['General', 'Academic', 'Award', 'Workshop', 'Hackathon', 'Internship', 'Sports', 'Participation', 'Training']],
  primary_color: ['color'], secondary_color: ['color'], background_color: ['color'],
  gradient_from: ['color'], gradient_to: ['color'], watermark_color: ['color'],
  border_style: ['enum', ['solid', 'double', 'dashed', 'ridge', 'none']],
  border_width: ['number', 0, 14], corner_radius: ['number', 0, 40], accent_ring: ['boolean'],
  gradient_enabled: ['boolean'], gradient_angle: ['number', 0, 360],
  watermark_text: ['text', 80], watermark_opacity: ['number', 0, 0.5], watermark_size: ['number', 24, 180],
  issuer_name: ['text', 120], issuer_title: ['text', 120]
};
const FIELD_RULES = {
  x: ['number', 0, DESIGN_W], y: ['number', 0, DESIGN_H],
  width: ['number', 12, DESIGN_W], height: ['number', 12, DESIGN_H],
  fontSize: ['number', 6, 64], fontFamily: ['enum', [...FONT_FAMILIES]],
  fontWeight: ['enum', ['normal', 'bold', '300', '400', '500', '600', '700', '800', '900']],
  fontStyle: ['enum', ['normal', 'italic']], color: ['color'], lineColor: ['color'],
  textAlign: ['enum', ['left', 'center', 'right', 'justify']],
  letterSpacing: ['number', -2, 12], lineHeight: ['number', 1, 2.5],
  textTransform: ['enum', ['none', 'uppercase', 'lowercase', 'capitalize']],
  underline: ['boolean'], opacity: ['number', 0.1, 1], rotation: ['number', 0, 359],
  visible: ['boolean'], lineThickness: ['number', 0.25, 8],
  text: ['text', 600], label: ['text', 80]
};

class DesignValidationError extends Error {}
const record = v => v && typeof v === 'object' && !Array.isArray(v);
function limitedString(value, max, name) {
  if (typeof value !== 'string' || value.length > max) throw new DesignValidationError(`Invalid ${name}`);
  return value.trim();
}
function property(value, rule, name) {
  const [kind, a, b] = rule;
  if (kind === 'boolean' && typeof value === 'boolean') return value;
  if (kind === 'color' && typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (kind === 'enum' && a.includes(value)) return value;
  if (kind === 'number' && typeof value === 'number' && Number.isFinite(value) && value >= a && value <= b) return value;
  if (kind === 'text') return limitedString(value, a, name);
  throw new DesignValidationError(`Invalid ${name}`);
}
function properties(data, rules) {
  if (!record(data)) throw new DesignValidationError('Invalid properties');
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (!Object.hasOwn(rules, key)) throw new DesignValidationError(`Unsupported property: ${key}`);
    out[key] = property(value, rules[key], key);
  }
  return out;
}

// Clamp slight edge overflows to a 32-point safe area, but reject invalid or non-finite model coordinates.
function fitField(field) {
  const next = { ...field };
  const qr = field.type === 'certificate_qr';
  const image = field.type === 'logo_image' || field.type === 'signature_image';
  const w = qr ? Math.max(72, Math.min(120, next.width ?? 80)) : Math.min(next.width ?? 240, 728);
  const h = qr ? w : Math.min(next.height ?? (image ? 60 : 40), 496);
  const x = next.x ?? 96, y = next.y ?? 170;
  if (![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || x > DESIGN_W || y > DESIGN_H || w <= 0 || h <= 0) {
    throw new DesignValidationError('Invalid field coordinates');
  }
  next.width = w;
  next.height = h;
  next.x = Math.round(Math.max(32, Math.min(x, DESIGN_W - 32 - w)));
  next.y = Math.round(Math.max(32, Math.min(y, DESIGN_H - 32 - h)));
  return next;
}

function luminance(hex) {
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function readableColor(color, backgrounds, minimum) {
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  if (backgrounds.every(bg => contrast(color, bg) >= minimum)) return color;
  const mix = (target, amount) => '#' + [1, 3, 5].map(i => {
    const original = parseInt(color.slice(i, i + 2), 16);
    return Math.round(original + (target - original) * amount).toString(16).padStart(2, '0');
  }).join('');
  for (let step = 1; step <= 20; step++) {
    const amount = step / 20;
    for (const target of [0, 255]) {
      const next = mix(target, amount);
      if (backgrounds.every(bg => contrast(next, bg) >= minimum)) return next;
    }
  }
  return '#0f172a';
}

function validatePlan(data, template) {
  if (!record(data) || !INTENTS.has(data.intent)) throw new DesignValidationError('Invalid design intent');
  const summary = limitedString(data.summary, 360, 'summary');
  const original = Array.isArray(template.fields) ? template.fields : [];
  const replacing = data.intent === 'create' && data.replace_existing_fields === true;
  const fields = replacing ? [] : original.map(f => ({ ...f }));
  const changes = properties(data.template_changes || {}, TEMPLATE_RULES);
  const operations = data.field_operations || [];
  if (!Array.isArray(operations) || operations.length > 60) throw new DesignValidationError('Too many field operations');
  const clean = [];
  const assetWarnings = [];
  for (const op of operations) {
    if (!record(op) || !OPS.has(op.type) || !FIELD_TYPES.has(op.field_type)) {
      throw new DesignValidationError('Unsupported field operation or field type');
    }
    if (op.type === 'add_field' && ['logo_image', 'signature_image'].includes(op.field_type)) {
      assetWarnings.push(`Please upload your ${op.field_type === 'logo_image' ? 'logo' : 'signature'} image first; no empty image placeholder was added.`);
      continue;
    }
    const target = op.field_id ? fields.find(f => f.id === op.field_id && f.type === op.field_type)
      : fields.find(f => f.type === op.field_type);
    if (op.type !== 'add_field' && !target) throw new DesignValidationError('Field not found in current design');
    const props = properties(op.properties || {}, FIELD_RULES);
    const edit = { type: op.type, field_type: op.field_type };
    if (op.field_id) edit.field_id = limitedString(op.field_id, 80, 'field ID');
    if (op.type === 'remove_field' || op.type === 'reorder_layer') {
      if (Object.keys(props).length) throw new DesignValidationError('Unexpected properties');
      if (op.type === 'reorder_layer') {
        if (!['front', 'back', 'forward', 'backward'].includes(op.direction)) throw new DesignValidationError('Invalid layer direction');
        edit.direction = op.direction;
      }
      if (op.type === 'remove_field') fields.splice(fields.indexOf(target), 1);
    } else if (op.type === 'add_field') {
      const added = fitField({ type: op.field_type, ...props });
      fields.push(added);
      Object.assign(edit, { properties: { ...props, x: added.x, y: added.y,
        width: added.width, height: added.height } });
    } else {
      if (op.type === 'duplicate_field') fields.push(fitField({ ...target, ...props }));
      else Object.assign(target, fitField({ ...target, ...props }));
      edit.properties = props;
      const fitted = fitField(op.type === 'duplicate_field' ? { ...target, ...props } : target);
      for (const k of ['x', 'y', 'width', 'height']) edit.properties[k] = fitted[k];
    }
    clean.push(edit);
    if (fields.length > 60) throw new DesignValidationError('Too many fields');
  }
  const gradient = changes.gradient_enabled ?? template.gradient_enabled;
  const backgrounds = gradient ? [changes.gradient_from || template.gradient_from || '#ffffff',
    changes.gradient_to || template.gradient_to || '#ffffff'] : [changes.background_color || template.background_color || '#ffffff'];
  const safeBackgrounds = backgrounds.filter(v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v));
  const backgroundChanged = ['background_color', 'gradient_enabled', 'gradient_from', 'gradient_to']
    .some(key => Object.hasOwn(changes, key));
  let fixedContrast = false;
  const artistic = new Set(['divider', 'certificate_qr', 'logo_image', 'signature_image']);
  for (const op of clean) {
    if (artistic.has(op.field_type) || !op.properties ||
        (op.type !== 'add_field' && !Object.hasOwn(op.properties, 'color') && !backgroundChanged)) continue;
    const current = fields.find(f => f.type === op.field_type && (!op.field_id || f.id === op.field_id));
    const color = op.properties.color || current?.color || '#111827';
    const size = op.properties.fontSize || current?.fontSize || 16;
    const next = readableColor(color, safeBackgrounds, size >= 18 ? 3 : 4.5);
    if (next !== color) { op.properties.color = next; fixedContrast = true; }
  }
  if (backgroundChanged) {
    for (const f of fields) {
      if (!f.id || artistic.has(f.type) || clean.some(op => op.field_id === f.id &&
          (op.type === 'remove_field' || op.properties?.color))) continue;
      const color = f.color || '#111827';
      const next = readableColor(color, safeBackgrounds, (f.fontSize || 16) >= 18 ? 3 : 4.5);
      if (next !== color) {
        clean.push({ type: 'restyle_field', field_type: f.type, field_id: f.id, properties: { color: next } });
        fixedContrast = true;
      }
    }
  }
  const notes = (key) => {
    const items = data[key] || [];
    if (!Array.isArray(items) || items.length > 6) throw new DesignValidationError(`Invalid ${key}`);
    return items.map(v => limitedString(v, 180, key));
  };
  return { intent: data.intent, summary, replace_existing_fields: replacing,
    template_changes: changes, field_operations: clean, design_notes: notes('design_notes'),
    warnings: [...notes('warnings'), ...assetWarnings.slice(0, 2),
      ...(fixedContrast ? ['Low-contrast text colors were adjusted for readability.'] : [])] };
}

function validateResponse(data, template) {
  if (!record(data)) throw new DesignValidationError('Invalid AI response');
  if (data.intent === 'variation' || Array.isArray(data.variants)) {
    if (!Array.isArray(data.variants) || data.variants.length !== 3) throw new DesignValidationError('Expected three variants');
    return { intent: 'variation', summary: limitedString(data.summary || 'Three design directions to choose from.', 360, 'summary'),
      variants: data.variants.map(v => {
        if (!record(v)) throw new DesignValidationError('Invalid variant');
        const name = limitedString(v.name, 36, 'variant name');
        // Accept a variant object or a {name, design} wrapper; the operations
        // themselves still pass the same strict schema and geometry checks.
        const raw = record(v.design) ? v.design : v;
        const candidate = { ...raw, intent: raw.intent && raw.intent !== 'variation' ? raw.intent : 'style',
          summary: raw.summary || `${name} design direction` };
        return { name, design: validatePlan(candidate, template) };
      }) };
  }
  return validatePlan(data, template);
}

module.exports = { FIELD_TYPES, FONT_FAMILIES, TEMPLATE_RULES, FIELD_RULES,
  DesignValidationError, validateResponse, validatePlan, fitField };