import {
  User, Mail, Award, Star, Building2, FileText, CalendarDays, Hash,
  Link as LinkIcon, QrCode, Type, AlignLeft, PenTool, Image as ImageIcon,
  Minus, BadgeCheck
} from 'lucide-react';

/* ---------------------------------------------------------------------------
 * Geometry
 *
 * Field coordinates are stored in a 792 x 560 "design space" — the historical
 * format, kept so every saved template and both PDF renderers keep working.
 * The certificate itself is a landscape LETTER page (792 x 612 pt), which the
 * canvas renders 1:1 at zoom 1. backend/modules/bulkGeneration/certificateRenderer.js
 * scales y and font sizes by exactly SCALE_Y, so the canvas does the same and
 * what you design is what the PDF contains.
 * -------------------------------------------------------------------------*/

export const CANVAS_W = 792;
export const CANVAS_H = 560;
export const PAGE_W = 792;
export const PAGE_H = 612;
export const SCALE_Y = PAGE_H / CANVAS_H;

export const BORDER_INSET = 20; // mirrors BORDER_INSET in the renderer

export const toPageY = (y) => y * SCALE_Y;
export const fromPageY = (y) => y / SCALE_Y;

export const uid = () => 'f' + Math.random().toString(36).slice(2, 9);

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/* ---------------------------------------------------------------------------
 * Typography
 *
 * PDF standard-14 metrics (PDFKit's AFM data) paired with the metrics of the
 * browser font we substitute. Both are needed to put DOM text on the same
 * baseline as the PDF: PDFKit draws the baseline at `y + ascender * size`,
 * whereas CSS draws it at `top + halfLeading + browserAscent * size`.
 * The stacks lead with Arial / Times New Roman / Courier New because those ship
 * on every platform with stable metrics (Arial is metric-compatible with
 * Helvetica, Times New Roman with Times).
 * -------------------------------------------------------------------------*/

const FONT_METRICS = {
  Helvetica: { asc: 0.718, desc: 0.207, bAsc: 0.90527, bDesc: 0.21191, stack: 'Arial, Helvetica, sans-serif' },
  Times: { asc: 0.683, desc: 0.217, bAsc: 0.89111, bDesc: 0.21631, stack: '"Times New Roman", Times, serif' },
  Courier: { asc: 0.629, desc: 0.157, bAsc: 0.83252, bDesc: 0.30029, stack: '"Courier New", Courier, monospace' }
};

/** Base family of a stored fontFamily value, tolerating legacy '-Bold' names. */
export function fontBase(family) {
  const lower = String(family || 'Helvetica').toLowerCase();
  if (lower.includes('times')) return 'Times';
  if (lower.includes('courier')) return 'Courier';
  return 'Helvetica';
}

// Legacy templates encode the variant in fontFamily ('Helvetica-Bold'), newer
// ones use fontWeight/fontStyle. resolvePdfFont() on the server ORs both, so we
// do too — otherwise canvas and PDF would disagree on old designs.
export const isBold = (f = {}) =>
  f.fontWeight === 'bold' || f.fontWeight === 'bolder' || num(f.fontWeight, 400) >= 600 ||
  String(f.fontFamily || '').toLowerCase().includes('bold');

export const isItalic = (f = {}) =>
  f.fontStyle === 'italic' || f.fontStyle === 'oblique' ||
  /italic|oblique/.test(String(f.fontFamily || '').toLowerCase());

/**
 * CSS needed to draw a field's text where the PDF will draw it.
 * `lineHeight` is a multiple of the font size (1 for single-line fields).
 */
export function textLayout(field, lineHeight = 1) {
  const m = FONT_METRICS[fontBase(field.fontFamily)];
  const size = Math.max(1, num(field.fontSize, 16) * SCALE_Y);
  const browserSum = m.bAsc + m.bDesc;
  // Solve top + (lineHeight - browserSum)/2 * size + bAsc * size == y + asc * size
  const topOffset = size * (m.asc - m.bAsc - (lineHeight - browserSum) / 2);
  return {
    fontFamily: m.stack,
    fontSize: size,
    lineHeightPx: lineHeight * size,
    topOffset,
    fontWeight: isBold(field) ? 700 : 400,
    fontStyle: isItalic(field) ? 'italic' : 'normal'
  };
}

export const FONT_FAMILIES = [
  { value: 'Helvetica', label: 'Helvetica · sans' },
  { value: 'Helvetica-Bold', label: 'Helvetica Bold' },
  { value: 'Times-Roman', label: 'Times · serif' },
  { value: 'Times-Bold', label: 'Times Bold' },
  { value: 'Times-Italic', label: 'Times Italic' },
  { value: 'Courier', label: 'Courier · mono' },
  { value: 'Courier-Bold', label: 'Courier Bold' }
];

export function applyTextTransform(text, transform) {
  const str = String(text ?? '');
  if (transform === 'uppercase') return str.toUpperCase();
  if (transform === 'lowercase') return str.toLowerCase();
  if (transform === 'capitalize') return str.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
  return str;
}

/* ---------------------------------------------------------------------------
 * Field catalogue
 * -------------------------------------------------------------------------*/

export const FIELD_TYPES = [
  // Recipient data
  { type: 'recipient_name', label: 'Recipient Name', icon: User, group: 'Recipient', sample: 'Jane Doe', defaults: { fontSize: 34, fontWeight: 'bold', width: 420 } },
  { type: 'recipient_email', label: 'Recipient Email', icon: Mail, group: 'Recipient', sample: 'jane.doe@example.com', defaults: { fontSize: 11, color: '#6b7280' } },
  { type: 'rank', label: 'Rank / Position', icon: Award, group: 'Recipient', sample: 'First Place', defaults: { fontSize: 18, fontWeight: 'bold' } },
  { type: 'score', label: 'Score / Grade', icon: Star, group: 'Recipient', sample: 'Distinction (A+)', defaults: { fontSize: 14 } },

  // Event data
  { type: 'event_title', label: 'Event Title', icon: FileText, group: 'Event', sample: 'Global AI Hackathon 2025', defaults: { fontSize: 20, fontWeight: 'bold' } },
  { type: 'organization_name', label: 'Organization', icon: Building2, group: 'Event', sample: 'Acme University', defaults: { fontSize: 14 } },
  { type: 'issue_date', label: 'Issue Date', icon: CalendarDays, group: 'Event', sample: new Date().toISOString().split('T')[0], defaults: { fontSize: 12, color: '#6b7280' } },

  // Verification
  { type: 'certificate_id', label: 'Certificate ID', icon: Hash, group: 'Verification', sample: 'CERT-2025-A1B2C3', defaults: { fontSize: 10, color: '#6b7280' } },
  { type: 'certificate_link', label: 'Verify Link', icon: LinkIcon, group: 'Verification', sample: 'certverify.campus.edu/verify/CERT-2025-A1B2C3', defaults: { fontSize: 9, color: '#6b7280' } },
  { type: 'certificate_qr', label: 'QR Code', icon: QrCode, group: 'Verification', sample: 'QR', defaults: { width: 80, height: 80 } },

  // Signature block
  { type: 'issuer_name', label: 'Issuer Name', icon: BadgeCheck, group: 'Signature', sample: '', defaults: { fontSize: 12, fontWeight: 'bold', width: 200, textAlign: 'center' } },
  { type: 'issuer_title', label: 'Issuer Title', icon: BadgeCheck, group: 'Signature', sample: '', defaults: { fontSize: 10, color: '#6b7280', width: 200, textAlign: 'center' } },
  { type: 'signature_image', label: 'Signature Image', icon: PenTool, group: 'Signature', sample: '', defaults: { width: 170, height: 55 } },

  // Free content
  { type: 'custom_text', label: 'Static Text', icon: Type, group: 'Content', sample: 'has successfully completed', defaults: { fontSize: 14 } },
  { type: 'text_block', label: 'Paragraph', icon: AlignLeft, group: 'Content', sample: 'This certificate is awarded in recognition of outstanding achievement and dedication throughout the programme.', defaults: { fontSize: 11, width: 380, lineHeight: 1.45, fontWeight: 'normal' } },
  { type: 'logo_image', label: 'Logo / Seal', icon: ImageIcon, group: 'Content', sample: '', defaults: { width: 90, height: 90 } },
  { type: 'divider', label: 'Divider Line', icon: Minus, group: 'Content', sample: '', defaults: { width: 220, lineThickness: 1.5, lineColor: '#94a3b8' } }
];

export const FIELD_TYPE_MAP = FIELD_TYPES.reduce((acc, t) => { acc[t.type] = t; return acc; }, {});

export const FIELD_GROUPS = ['Recipient', 'Event', 'Verification', 'Signature', 'Content'];

export const IMAGE_FIELD_TYPES = ['signature_image', 'logo_image'];
export const TEXT_FIELD_TYPES = FIELD_TYPES
  .filter((t) => !IMAGE_FIELD_TYPES.includes(t.type) && t.type !== 'certificate_qr' && t.type !== 'divider')
  .map((t) => t.type);

export const isTextField = (f) => !!f && TEXT_FIELD_TYPES.includes(f.type);
export const isImageField = (f) => !!f && IMAGE_FIELD_TYPES.includes(f.type);

/** Dummy values used for on-canvas previews (the PDF preview uses the server's). */
export const SAMPLE_VALUES = FIELD_TYPES.reduce((acc, t) => {
  if (t.sample) acc[t.type] = t.sample;
  return acc;
}, {});

/** What a field should display on the canvas. */
export function fieldSampleText(field, template = {}) {
  switch (field.type) {
    case 'custom_text':
    case 'text_block':
      return field.text || '';
    case 'issuer_name':
      return template.issuer_name || 'Authorised Signatory';
    case 'issuer_title':
      return template.issuer_title || 'Issuing Authority';
    default:
      return SAMPLE_VALUES[field.type] || field.label || '';
  }
}

export function makeField(typeDef, overrides = {}) {
  const def = typeof typeDef === 'string' ? FIELD_TYPE_MAP[typeDef] : typeDef;
  if (!def) return null;
  return {
    id: uid(),
    type: def.type,
    label: def.label,
    text: def.type === 'custom_text' || def.type === 'text_block' ? def.sample : '',
    x: Math.round(CANVAS_W / 2 - 110),
    y: Math.round(CANVAS_H / 2 - 15),
    width: 240,
    height: 40,
    fontFamily: 'Helvetica',
    fontSize: 16,
    fontWeight: 'normal',
    fontStyle: 'normal',
    color: '#111827',
    textAlign: 'left',
    letterSpacing: 0,
    lineHeight: 1.35,
    textTransform: 'none',
    underline: false,
    opacity: 1,
    rotation: 0,
    visible: true,
    locked: false,
    ...def.defaults,
    ...overrides
  };
}

/* ---------------------------------------------------------------------------
 * Template shape
 * -------------------------------------------------------------------------*/

export const BORDER_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'double', label: 'Double' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'ridge', label: 'Ridge' },
  { value: 'none', label: 'None' }
];

export const BACKGROUND_FITS = [
  { value: 'stretch', label: 'Stretch' },
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' }
];

export const CATEGORIES = [
  'General', 'Academic', 'Award', 'Workshop', 'Hackathon',
  'Internship', 'Sports', 'Participation', 'Training'
];

export const emptyTemplate = () => ({
  id: null,
  name: 'Untitled Template',
  style: 'modern',
  description: '',
  category: 'General',
  tags: [],
  primary_color: '#1e3a8a',
  secondary_color: '#eab308',
  border_style: 'solid',
  border_width: 4,
  corner_radius: 0,
  accent_ring: true,
  background_color: '#ffffff',
  background_image: '',
  background_fit: 'stretch',
  background_opacity: 1,
  gradient_enabled: false,
  gradient_from: '#ffffff',
  gradient_to: '#e2e8f0',
  gradient_angle: 90,
  watermark_text: '',
  watermark_color: '#94a3b8',
  watermark_opacity: 0.08,
  watermark_size: 72,
  issuer_name: 'Dean of Academic Affairs',
  issuer_title: 'University Chancellor',
  fields: []
});

/** Fills in everything a template loaded from the API might be missing. */
export function normalizeTemplate(tpl = {}) {
  const base = emptyTemplate();
  const out = { ...base };
  for (const key of Object.keys(base)) {
    if (tpl[key] !== undefined && tpl[key] !== null) out[key] = tpl[key];
  }
  out.id = tpl.id ?? null;
  out.tags = Array.isArray(tpl.tags) ? tpl.tags.map(String) : [];
  out.fields = (Array.isArray(tpl.fields) ? tpl.fields : []).map((f) => ({
    ...makeField(f.type || 'custom_text', {}),
    ...f,
    id: f.id || uid()
  }));
  return out;
}

/* ---------------------------------------------------------------------------
 * Curated presets
 * -------------------------------------------------------------------------*/

export const COLOR_PALETTES = [
  { name: 'Midnight', primary: '#1e3a8a', secondary: '#eab308' },
  { name: 'Indigo', primary: '#4338ca', secondary: '#a5b4fc' },
  { name: 'Emerald', primary: '#065f46', secondary: '#34d399' },
  { name: 'Gold', primary: '#b45309', secondary: '#78350f' },
  { name: 'Graphite', primary: '#0f172a', secondary: '#64748b' },
  { name: 'Crimson', primary: '#9f1239', secondary: '#fbbf24' }
];

// Centred content column: x 96 + width 600 puts the centre at 396 = 792 / 2.
const COL = { x: 96, width: 600, textAlign: 'center' };

export const STARTER_LAYOUTS = [
  {
    id: 'modern-centered',
    name: 'Modern Centered',
    description: 'Centred stack with a QR badge and one signature line.',
    patch: { style: 'modern', primary_color: '#1e3a8a', secondary_color: '#eab308', border_style: 'solid', border_width: 4, corner_radius: 6, accent_ring: true },
    fields: [
      ['custom_text', { ...COL, y: 78, text: 'Certificate of Achievement', fontSize: 28, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 3, color: '#1e3a8a' }],
      ['custom_text', { ...COL, y: 132, text: 'This certificate is proudly presented to', fontSize: 12, color: '#4b5563' }],
      ['recipient_name', { ...COL, y: 162, fontSize: 40, fontWeight: 'bold', color: '#111827' }],
      ['divider', { x: 276, y: 228, width: 240, lineColor: '#eab308', lineThickness: 2 }],
      ['custom_text', { ...COL, y: 244, text: 'for outstanding performance as', fontSize: 11, color: '#4b5563' }],
      ['rank', { ...COL, y: 266, fontSize: 18, fontWeight: 'bold', color: '#eab308' }],
      ['event_title', { ...COL, y: 300, fontSize: 20, fontWeight: 'bold', color: '#1e3a8a' }],
      ['issue_date', { ...COL, y: 340, fontSize: 11, color: '#6b7280' }],
      ['divider', { x: 110, y: 424, width: 190, lineColor: '#94a3b8', lineThickness: 1 }],
      ['issuer_name', { x: 110, y: 432, width: 190, textAlign: 'center', fontSize: 12, fontWeight: 'bold' }],
      ['issuer_title', { x: 110, y: 452, width: 190, textAlign: 'center', fontSize: 10, color: '#6b7280' }],
      ['certificate_qr', { x: 620, y: 396, width: 84, height: 84 }],
      ['certificate_id', { ...COL, y: 498, fontSize: 9, color: '#9ca3af' }]
    ]
  },
  {
    id: 'classic-formal',
    name: 'Classic Formal',
    description: 'Serif type, double border and a gold watermark.',
    patch: { style: 'classic', primary_color: '#b45309', secondary_color: '#78350f', border_style: 'double', border_width: 5, corner_radius: 0, accent_ring: true, watermark_text: 'CERTIFIED', watermark_opacity: 0.07, watermark_color: '#b45309' },
    fields: [
      ['organization_name', { ...COL, y: 76, fontFamily: 'Times-Roman', fontSize: 15, textTransform: 'uppercase', letterSpacing: 4, color: '#78350f' }],
      ['custom_text', { ...COL, y: 112, text: 'Certificate of Excellence', fontFamily: 'Times-Roman', fontSize: 30, fontWeight: 'bold', color: '#b45309' }],
      ['custom_text', { ...COL, y: 164, text: 'is hereby awarded to', fontFamily: 'Times-Roman', fontSize: 12, fontStyle: 'italic', color: '#57534e' }],
      ['recipient_name', { ...COL, y: 194, fontFamily: 'Times-Roman', fontSize: 38, fontWeight: 'bold', color: '#292524' }],
      ['divider', { x: 246, y: 254, width: 300, lineColor: '#b45309', lineThickness: 1 }],
      ['text_block', { x: 176, y: 272, width: 440, textAlign: 'center', text: 'in recognition of exemplary dedication and achievement demonstrated throughout the programme.', fontFamily: 'Times-Roman', fontSize: 12, lineHeight: 1.5, color: '#44403c' }],
      ['event_title', { ...COL, y: 336, fontFamily: 'Times-Roman', fontSize: 18, fontWeight: 'bold', color: '#78350f' }],
      ['divider', { x: 110, y: 428, width: 200, lineColor: '#a8a29e', lineThickness: 1 }],
      ['issuer_name', { x: 110, y: 436, width: 200, textAlign: 'center', fontFamily: 'Times-Roman', fontSize: 12, fontWeight: 'bold' }],
      ['issuer_title', { x: 110, y: 456, width: 200, textAlign: 'center', fontFamily: 'Times-Roman', fontSize: 10, color: '#78716c' }],
      ['issue_date', { x: 482, y: 436, width: 200, textAlign: 'center', fontFamily: 'Times-Roman', fontSize: 11, color: '#57534e' }],
      ['divider', { x: 482, y: 428, width: 200, lineColor: '#a8a29e', lineThickness: 1 }],
      ['custom_text', { x: 482, y: 456, width: 200, textAlign: 'center', text: 'Date of Issue', fontFamily: 'Times-Roman', fontSize: 10, color: '#78716c' }],
      ['certificate_id', { ...COL, y: 500, fontFamily: 'Times-Roman', fontSize: 9, color: '#a8a29e' }]
    ]
  },
  {
    id: 'left-rail',
    name: 'Left Aligned',
    description: 'Editorial left rail with a logo slot and gradient wash.',
    patch: { style: 'modern', primary_color: '#4338ca', secondary_color: '#a5b4fc', border_style: 'solid', border_width: 3, corner_radius: 14, accent_ring: false, gradient_enabled: true, gradient_from: '#ffffff', gradient_to: '#eef2ff', gradient_angle: 120 },
    fields: [
      ['logo_image', { x: 96, y: 58, width: 74, height: 74 }],
      ['custom_text', { x: 96, y: 152, width: 460, text: 'Certificate of Completion', fontSize: 26, fontWeight: 'bold', color: '#4338ca', letterSpacing: 1 }],
      ['custom_text', { x: 96, y: 196, width: 460, text: 'Awarded to', fontSize: 11, textTransform: 'uppercase', letterSpacing: 2, color: '#6b7280' }],
      ['recipient_name', { x: 96, y: 216, width: 500, fontSize: 36, fontWeight: 'bold', color: '#111827' }],
      ['recipient_email', { x: 96, y: 268, width: 400, fontSize: 10, color: '#9ca3af' }],
      ['divider', { x: 96, y: 296, width: 120, lineColor: '#a5b4fc', lineThickness: 3 }],
      ['text_block', { x: 96, y: 314, width: 420, text: 'for the successful completion of all requirements, assessments and practical work.', fontSize: 11, lineHeight: 1.5, color: '#4b5563' }],
      ['event_title', { x: 96, y: 372, width: 460, fontSize: 17, fontWeight: 'bold', color: '#4338ca' }],
      ['rank', { x: 96, y: 400, width: 300, fontSize: 12, color: '#059669' }],
      ['score', { x: 300, y: 400, width: 300, fontSize: 12, color: '#059669' }],
      ['signature_image', { x: 96, y: 430, width: 150, height: 44 }],
      ['issuer_name', { x: 96, y: 478, width: 200, textAlign: 'left', fontSize: 11, fontWeight: 'bold' }],
      ['issuer_title', { x: 96, y: 496, width: 200, textAlign: 'left', fontSize: 9, color: '#6b7280' }],
      ['certificate_qr', { x: 618, y: 400, width: 88, height: 88 }],
      ['certificate_link', { x: 380, y: 500, width: 316, textAlign: 'right', fontSize: 8, color: '#9ca3af' }]
    ]
  },
  {
    id: 'minimal-wide',
    name: 'Minimal Wide',
    description: 'Type-only layout, thin rules, no accent ring.',
    patch: { style: 'minimal', primary_color: '#0f172a', secondary_color: '#64748b', border_style: 'solid', border_width: 1.5, corner_radius: 0, accent_ring: false, background_color: '#ffffff' },
    fields: [
      ['custom_text', { ...COL, y: 96, text: 'Certificate', fontSize: 14, textTransform: 'uppercase', letterSpacing: 8, color: '#64748b' }],
      ['divider', { x: 336, y: 124, width: 120, lineColor: '#cbd5e1', lineThickness: 1 }],
      ['recipient_name', { ...COL, y: 176, fontSize: 46, color: '#0f172a' }],
      ['custom_text', { ...COL, y: 250, text: 'has completed', fontSize: 11, textTransform: 'uppercase', letterSpacing: 3, color: '#94a3b8' }],
      ['event_title', { ...COL, y: 276, fontSize: 22, color: '#0f172a' }],
      ['divider', { x: 246, y: 330, width: 300, lineColor: '#e2e8f0', lineThickness: 1 }],
      ['issue_date', { x: 96, y: 348, width: 290, textAlign: 'left', fontSize: 10, color: '#94a3b8' }],
      ['certificate_id', { x: 406, y: 348, width: 290, textAlign: 'right', fontSize: 10, color: '#94a3b8' }],
      ['issuer_name', { ...COL, y: 448, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }],
      ['issuer_title', { ...COL, y: 468, fontSize: 9, color: '#94a3b8' }],
      ['certificate_qr', { x: 356, y: 388, width: 72, height: 72 }]
    ]
  }
];

/** Materialises a starter layout's field list. */
export function buildStarterFields(layout) {
  return layout.fields.map(([type, props]) => makeField(type, props)).filter(Boolean);
}
