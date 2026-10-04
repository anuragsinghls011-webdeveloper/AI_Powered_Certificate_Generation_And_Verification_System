import { FIELD_TYPE_MAP, FONT_FAMILIES, CANVAS_W, CANVAS_H, makeField } from '../constants';

const META = ['name', 'style', 'category', 'primary_color', 'secondary_color', 'background_color',
  'border_style', 'border_width', 'corner_radius', 'accent_ring', 'gradient_enabled', 'gradient_from',
  'gradient_to', 'gradient_angle', 'watermark_text', 'watermark_color', 'watermark_opacity',
  'watermark_size', 'issuer_name', 'issuer_title'];
const FIELD = ['id', 'type', 'x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight',
  'fontStyle', 'color', 'textAlign', 'letterSpacing', 'lineHeight', 'visible', 'text', 'label',
  'lineColor', 'lineThickness'];
const PROPS = new Set(['x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle',
  'color', 'lineColor', 'textAlign', 'letterSpacing', 'lineHeight', 'textTransform', 'underline',
  'opacity', 'rotation', 'visible', 'lineThickness', 'text', 'label']);
const OPS = new Set(['add_field', 'update_field', 'remove_field', 'duplicate_field', 'move_field',
  'resize_field', 'restyle_field', 'reorder_layer']);
const COLOR = /^#[a-fA-F0-9]{6}$/;
const RANGES = { x: [0, CANVAS_W], y: [0, CANVAS_H], width: [12, CANVAS_W],
  height: [12, CANVAS_H], fontSize: [6, 64], opacity: [0.1, 1], rotation: [0, 359],
  letterSpacing: [-2, 12], lineHeight: [1, 2.5], lineThickness: [0.25, 8] };
const META_RANGES = { border_width: [0.5, 14], corner_radius: [0, 40],
  gradient_angle: [0, 360], watermark_opacity: [0, 0.5], watermark_size: [24, 180] };
const META_OPTIONS = { style: ['modern', 'classic', 'minimal'],
  category: ['General', 'Academic', 'Award', 'Workshop', 'Hackathon', 'Internship', 'Sports', 'Participation', 'Training'],
  border_style: ['solid', 'double', 'dashed', 'ridge', 'none'] };

export function compactDesign(template) {
  const result = { id: template.id || null };
  for (const key of META) if (template[key] !== undefined) result[key] = template[key];
  result.fields = (template.fields || []).map(f => {
    const out = {};
    for (const key of FIELD) if (f[key] !== undefined) out[key] = f[key];
    if (['signature_image', 'logo_image'].includes(f.type)) out.has_image = !!f.image;
    return out;
  });
  return result;
}

export const designFingerprint = template => JSON.stringify(compactDesign(template));

function validValue(key, value) {
  if (RANGES[key]) return typeof value === 'number' && Number.isFinite(value) &&
    value >= RANGES[key][0] && value <= RANGES[key][1];
  if (['color', 'lineColor'].includes(key)) return typeof value === 'string' && COLOR.test(value);
  if (key === 'fontFamily') return FONT_FAMILIES.some(f => f.value === value);
  if (['underline', 'visible'].includes(key)) return typeof value === 'boolean';
  if (key === 'text' || key === 'label') return typeof value === 'string' && value.length <= (key === 'text' ? 600 : 80);
  if (key === 'textAlign') return ['left', 'right', 'center', 'justify'].includes(value);
  if (key === 'fontWeight') return ['normal', 'bold', '300', '400', '500', '600', '700', '800', '900'].includes(value);
  if (key === 'fontStyle') return ['normal', 'italic'].includes(value);
  if (key === 'textTransform') return ['none', 'uppercase', 'lowercase', 'capitalize'].includes(value);
  return false;
}

function validTemplateChange(key, value) {
  if (['primary_color', 'secondary_color', 'background_color', 'gradient_from', 'gradient_to', 'watermark_color'].includes(key)) {
    return typeof value === 'string' && COLOR.test(value);
  }
  if (META_OPTIONS[key]) return META_OPTIONS[key].includes(value);
  if (META_RANGES[key]) return typeof value === 'number' && Number.isFinite(value) &&
    value >= META_RANGES[key][0] && value <= META_RANGES[key][1];
  if (['accent_ring', 'gradient_enabled'].includes(key)) return typeof value === 'boolean';
  return typeof value === 'string' && value.length <= (key === 'watermark_text' ? 80 : 120);
}

function safeGeometry(f) {
  const { x, y, width, height } = f;
  if (![x, y, width, height].every(v => typeof v === 'number' && Number.isFinite(v)) ||
      x < 0 || y < 0 || width < 12 || height < 12 || x + width > CANVAS_W || y + height > CANVAS_H ||
      (f.type === 'certificate_qr' && (width < 72 || height !== width))) {
    throw new Error('The proposed layout does not fit the certificate canvas.');
  }
}

export function previewDesign(template, design) {
  if (!design || typeof design !== 'object' || !Array.isArray(design.field_operations) ||
      design.field_operations.length > 60 || !design.template_changes ||
      typeof design.template_changes !== 'object' || Array.isArray(design.template_changes) ||
      (design.replace_existing_fields && design.intent !== 'create')) throw new Error('Invalid design proposal.');
  const changes = {};
  for (const [key, value] of Object.entries(design.template_changes)) {
    if (!META.includes(key) || !validTemplateChange(key, value)) {
      throw new Error('Unsupported template change.');
    }
    changes[key] = value;
  }
  const fields = design.replace_existing_fields ? [] : template.fields.map(f => ({ ...f }));
  for (const op of design.field_operations) {
    if (!op || !OPS.has(op.type) || !FIELD_TYPE_MAP[op.field_type]) throw new Error('Unsupported field operation.');
    const props = op.properties || {};
    if (!props || typeof props !== 'object' || Array.isArray(props)) throw new Error('Invalid field properties.');
    for (const [key, value] of Object.entries(props)) {
      if (!PROPS.has(key) || !validValue(key, value)) throw new Error('Unsafe field change.');
    }
    const index = fields.findIndex(f => f.type === op.field_type && (!op.field_id || f.id === op.field_id));
    if (op.type === 'add_field') {
      const added = makeField(op.field_type, props);
      safeGeometry(added);
      fields.push(added);
    } else {
      if (index < 0) throw new Error('A field has changed. Generate a fresh design.');
      if (op.type === 'remove_field') fields.splice(index, 1);
      else if (op.type === 'duplicate_field') {
        const copy = { ...fields[index], ...props, id: makeField(op.field_type).id };
        safeGeometry(copy);
        fields.push(copy);
      } else if (op.type === 'reorder_layer') {
        if (!['front', 'back', 'forward', 'backward'].includes(op.direction)) throw new Error('Invalid layer order.');
        const [f] = fields.splice(index, 1);
        const nextIndex = op.direction === 'front' ? fields.length : op.direction === 'back' ? 0 :
          op.direction === 'forward' ? Math.min(index + 1, fields.length) : Math.max(0, index - 1);
        fields.splice(nextIndex, 0, f);
      } else {
        const next = { ...fields[index], ...props };
        safeGeometry(next);
        fields[index] = next;
      }
    }
  }
  if (fields.length > 60) throw new Error('Too many certificate fields.');
  return { ...template, ...changes, fields };
}

const readable = key => key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
export function designDiff(before, after) {
  const lines = [];
  for (const key of META) {
    if (before[key] !== after[key]) lines.push(`${readable(key)}: ${String(before[key] ?? 'none')} → ${String(after[key])}`);
  }
  for (const f of after.fields) {
    const old = before.fields.find(v => v.id === f.id);
    if (!old) { lines.push(`Added ${readable(f.type)}`); continue; }
    const changed = ['x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'color', 'textAlign', 'text'].filter(k => f[k] !== old[k]);
    if (changed.length) lines.push(`${readable(f.type)}: ${changed.slice(0, 3).map(k =>
      `${readable(k)} ${String(old[k] ?? '—')} → ${String(f[k])}`).join(', ')}`);
  }
  for (const f of before.fields) if (!after.fields.some(v => v.id === f.id)) lines.push(`Removed ${readable(f.type)}`);
  return lines.slice(0, 18);
}