// Translate only known, equivalent model spellings into the existing editor schema.
// This is not validation: every normalized result still passes aiSchema's strict checks.
const intents = { refine: 'improve', refinement: 'improve', enhance: 'improve',
  edit: 'modify', update: 'modify', update_template: 'modify', restyle: 'style',
  generate_variations: 'variation', variations: 'variation', generate_variants: 'variation' };
const operations = { add: 'add_field', update: 'update_field', modify: 'update_field',
  modify_field: 'update_field', move: 'move_field', resize: 'resize_field',
  delete: 'remove_field', delete_field: 'remove_field', remove: 'remove_field',
  style: 'restyle_field', restyle: 'restyle_field', style_field: 'restyle_field', duplicate: 'duplicate_field',
  reorder: 'reorder_layer' };
const types = { qr: 'certificate_qr', qr_code: 'certificate_qr', verification_qr: 'certificate_qr',
  recipient: 'recipient_name', participant_name: 'recipient_name', event_name: 'event_title',
  certificate_title: 'custom_text', heading: 'custom_text', logo: 'logo_image', signature: 'signature_image' };
const props = { font_size: 'fontSize', font_family: 'fontFamily', font_weight: 'fontWeight',
  font_style: 'fontStyle', text_align: 'textAlign', text_transform: 'textTransform',
  letter_spacing: 'letterSpacing', line_height: 'lineHeight', line_color: 'lineColor',
  line_thickness: 'lineThickness' };
const category = { competition: 'Award', recognition: 'Award', 'employee recognition': 'Award',
  'course completion': 'Training', course: 'Training', volunteer: 'Participation',
  'event participation': 'Participation', sports: 'Sports' };
const styles = { premium: 'classic', luxury: 'classic', traditional: 'classic',
  elegant: 'classic', formal: 'classic', corporate: 'modern', tech: 'modern',
  futuristic: 'modern', playful: 'modern', academic: 'classic' };
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

function normalizePlan(plan, template) {
  if (!plain(plan)) return plan;
  const intent = plan.intent || plan.action || (template.fields?.length ? 'modify' : 'create');
  const changes = { ...(plain(plan.template_changes) ? plan.template_changes : {}) };
  if (typeof changes.style === 'string') changes.style = styles[changes.style.toLowerCase()] || changes.style;
  if (typeof changes.category === 'string') changes.category = category[changes.category.toLowerCase()] || changes.category;
  if (typeof changes.border_width === 'number' && Number.isFinite(changes.border_width) &&
      changes.border_width >= 0 && changes.border_width <= 30) changes.border_width = Math.min(changes.border_width, 14);
  const field_operations = Array.isArray(plan.field_operations) ? plan.field_operations.map(op => {
    if (!plain(op)) return op;
    const field_type = types[op.field_type || op.fieldType] || op.field_type || op.fieldType;
    const type = operations[op.type] || op.type;
    const incoming = op.properties;
    let properties = incoming;
    if (plain(incoming)) {
      properties = {};
      for (const [key, value] of Object.entries(incoming)) {
        const canonical = props[key] || key;
        properties[canonical] = canonical === 'height' && value === 0 && field_type === 'divider' ? 12 : value;
      }
    }
    return { ...op, type, field_type, properties,
      field_id: op.field_id || (typeof op.id === 'string' ? op.id : undefined) };
  }) : plan.field_operations;
  return { ...plan, intent: intents[intent] || intent, template_changes: changes, field_operations };
}

function normalizeModelOutput(raw, template) {
  if (!plain(raw)) return raw;
  if (Array.isArray(raw.variants)) {
    return { ...raw, intent: 'variation', variants: raw.variants.map(variant => {
      if (!plain(variant)) return variant;
      return { ...variant, design: normalizePlan(plain(variant.design) ? variant.design : variant, template) };
    }) };
  }
  return normalizePlan(raw, template);
}

module.exports = { normalizeModelOutput };