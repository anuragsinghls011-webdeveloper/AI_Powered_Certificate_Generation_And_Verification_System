// Shared certificate PDF renderer — used by the single-download endpoint, the bulk
// worker AND the Design Studio's sample-PDF preview.
//
// Given a template document and a "field values" object, produces a PDF buffer.
//
// COORDINATE CONTRACT (must stay in sync with frontend/src/studio/constants.js):
//   Templates store field positions in a 792 x 560 "design space".
//   The page is landscape LETTER (792 x 612 pt), so:
//     page_x = design_x * (792/792) = design_x
//     page_y = design_y * (612/560)
//   Font sizes and vertical measurements scale by the same factor as y.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

const DESIGN_W = 792;
const DESIGN_H = 560;

// Inset of the outermost border stroke from the page edge, in points.
const BORDER_INSET = 20;

const num = (v, fallback = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Resolves a (family, weight, style) triple to one of PDF's standard-14 font names.
 * Legacy templates store variants directly in fontFamily ('Helvetica-Bold',
 * 'Times-Italic'), so those hints are honoured too and OR-ed with weight/style.
 */
function resolvePdfFont(family, weight, style) {
  const raw = String(family || 'Helvetica');
  const lower = raw.toLowerCase();

  if (lower.startsWith('zapf')) return 'ZapfDingbats';
  if (lower === 'symbol') return 'Symbol';

  const bold =
    weight === 'bold' ||
    weight === 'bolder' ||
    num(weight, 400) >= 600 ||
    lower.includes('bold');
  const italic =
    style === 'italic' ||
    style === 'oblique' ||
    lower.includes('italic') ||
    lower.includes('oblique');

  // Custom Google Fonts
  if (lower.includes('montserrat')) return italic ? 'Montserrat-Italic' : 'Montserrat';
  if (lower.includes('playfair')) return italic ? 'PlayfairDisplay-Italic' : 'PlayfairDisplay';
  if (lower.includes('greatvibes')) return 'GreatVibes';
  if (lower.includes('oswald')) return 'Oswald';
  if (lower.includes('lato')) {
    if (bold && italic) return 'Lato-BoldItalic';
    if (bold) return 'Lato-Bold';
    if (italic) return 'Lato-Italic';
    return 'Lato';
  }
  if (lower.includes('merriweather')) {
    if (bold && italic) return 'Merriweather-BoldItalic';
    if (bold) return 'Merriweather-Bold';
    if (italic) return 'Merriweather-Italic';
    return 'Merriweather';
  }
  if (lower.includes('cinzel')) return 'Cinzel';
  if (lower.includes('lora')) {
    if (italic) return 'Lora-Italic';
    return 'Lora';
  }
  if (lower.includes('alexbrush')) return 'AlexBrush';

  let base = 'Helvetica';
  if (lower.includes('times')) base = 'Times';
  else if (lower.includes('courier')) base = 'Courier';

  if (base === 'Times') {
    if (bold && italic) return 'Times-BoldItalic';
    if (bold) return 'Times-Bold';
    if (italic) return 'Times-Italic';
    return 'Times-Roman';
  }
  // Helvetica and Courier share the -Bold / -Oblique / -BoldOblique naming.
  if (bold && italic) return `${base}-BoldOblique`;
  if (bold) return `${base}-Bold`;
  if (italic) return `${base}-Oblique`;
  return base;
}

/** Dummy data used by the Design Studio's "Preview PDF" action. */
function sampleCertificateValues(overrides = {}) {
  return {
    recipient_name: 'Jane Doe',
    email: 'jane.doe@example.com',
    organization_name: 'Acme University',
    issuer_name: 'Dr. Elizabeth Warren',
    issuer_title: 'University Chancellor',
    rank: 'First Place',
    score: 'Distinction (A+)',
    event_title: 'Global AI Hackathon 2025',
    issue_date: new Date().toISOString().split('T')[0],
    certificate_id: 'CERT-2026-000123',
    verification_url: 'https://certverify.campus.edu/verify/CERT-2026-000123',
    ...overrides
  };
}

/**
 * Describes the concentric border strokes implied by a template's border settings.
 * Mirrored by borderLayers() in frontend/src/studio/geometry.js — keep both in sync.
 * @returns {Array<{inset:number,width:number,color:string,dashed:boolean,radius:number}>}
 */
function borderLayers(template = {}) {
  const style = template.border_style || 'solid';
  if (style === 'none') return [];

  const w = Math.max(0.5, num(template.border_width, 4));
  const primary = template.primary_color || '#1e3a8a';
  const accent = template.secondary_color || '#eab308';
  const radius = Math.max(0, num(template.corner_radius, 0));
  const layers = [];

  const push = (inset, width, color, dashed = false) =>
    layers.push({
      inset,
      width,
      color,
      dashed,
      // Keep the concentric rings visually parallel as they move inward.
      radius: Math.max(0, radius - (inset - BORDER_INSET))
    });

  switch (style) {
    case 'dashed':
      push(BORDER_INSET, w, primary, true);
      break;
    case 'double':
      push(BORDER_INSET, w, primary);
      push(BORDER_INSET + w + 3, Math.max(1, w / 2), primary);
      break;
    case 'ridge':
      push(BORDER_INSET, w, primary);
      push(BORDER_INSET + w, Math.max(1, w * 0.6), accent);
      break;
    case 'solid':
    default:
      push(BORDER_INSET, w, primary);
      break;
  }

  if (template.accent_ring !== false) {
    push(BORDER_INSET + w + 8, 1.5, accent);
  }
  return layers;
}

/** Endpoints of the gradient line. angle 0 = left→right, 90 = top→bottom. */
function gradientLine(angleDeg, w, h) {
  const rad = (num(angleDeg, 0) * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  const len = Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad));
  const dx = (Math.cos(rad) * len) / 2;
  const dy = (Math.sin(rad) * len) / 2;
  return [cx - dx, cy - dy, cx + dx, cy + dy];
}

function dataUrlToBuffer(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) return null;
  const b64 = dataUrl.split(',')[1];
  if (!b64) return null;
  try {
    return Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
}

/** Certificates persist a rendered QR; reuse it when present, else generate one. */
async function qrBuffer(values) {
  if (values && values.qr_code_b64) {
    try {
      return Buffer.from(values.qr_code_b64, 'base64');
    } catch {
      /* fall through to generating a fresh one */
    }
  }
  try {
    const dataUrl = await QRCode.toDataURL(values.verification_url || 'unknown');
    return dataUrlToBuffer(dataUrl);
  } catch {
    return null;
  }
}

function applyTextTransform(text, transform) {
  const str = String(text ?? '');
  switch (transform) {
    case 'uppercase': return str.toUpperCase();
    case 'lowercase': return str.toLowerCase();
    case 'capitalize': return str.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
    default: return str;
  }
}

function resolveFieldText(field, values) {
  switch (field.type) {
    case 'recipient_name': return values.recipient_name || '';
    case 'recipient_email': return values.email || values.recipient_email || '';
    case 'organization_name': return values.organization_name || values.issuer_name || '';
    case 'rank': return values.rank || '';
    case 'score': return values.score || values.grade || '';
    case 'event_title': return values.event_title || '';
    case 'issue_date': return values.issue_date || '';
    case 'certificate_id': return values.certificate_id || '';
    case 'certificate_link': return values.verification_url || '';
    case 'issuer_name': return field.text || values.issuer_name || '';
    case 'issuer_title': return field.text || values.issuer_title || '';
    case 'custom_text':
    case 'text_block': return field.text || '';
    default: return field.label || '';
  }
}

// ---------------------------------------------------------------------------
// Page decoration
// ---------------------------------------------------------------------------

function drawBackground(doc, template, pageW, pageH) {
  const hasGradient = !!template.gradient_enabled;
  const solid = template.background_color;

  if (hasGradient) {
    const [x1, y1, x2, y2] = gradientLine(template.gradient_angle, pageW, pageH);
    const grad = doc.linearGradient(x1, y1, x2, y2);
    grad.stop(0, template.gradient_from || '#ffffff');
    grad.stop(1, template.gradient_to || '#e2e8f0');
    doc.rect(0, 0, pageW, pageH).fill(grad);
  } else if (solid && solid !== '#ffffff') {
    doc.rect(0, 0, pageW, pageH).fill(solid);
  }

  const imgBuf = dataUrlToBuffer(template.background_image);
  if (!imgBuf) return;

  const opacity = clamp(num(template.background_opacity, 1), 0, 1);
  doc.save();
  if (opacity < 1) doc.opacity(opacity);
  try {
    // 'stretch' is the historical behaviour of both renderers, so it stays the
    // default for templates saved before background_fit existed.
    const fit = template.background_fit || 'stretch';
    if (fit === 'stretch') {
      doc.image(imgBuf, 0, 0, { width: pageW, height: pageH });
    } else if (fit === 'contain') {
      doc.image(imgBuf, 0, 0, { fit: [pageW, pageH], align: 'center', valign: 'center' });
    } else {
      doc.image(imgBuf, 0, 0, { cover: [pageW, pageH], align: 'center', valign: 'center' });
    }
  } catch {
    /* invalid image — leave the background as-is */
  }
  doc.restore();
  doc.opacity(1);
}

function drawBorders(doc, template, pageW, pageH) {
  for (const layer of borderLayers(template)) {
    doc.save();
    if (layer.dashed) doc.dash(layer.width * 2.5, { space: layer.width * 2 });

    const i = layer.inset;
    if (layer.radius > 0) {
      doc.roundedRect(i, i, pageW - i * 2, pageH - i * 2, layer.radius);
    } else {
      doc.rect(i, i, pageW - i * 2, pageH - i * 2);
    }
    doc.lineWidth(layer.width).strokeColor(layer.color).stroke();

    if (layer.dashed) doc.undash();
    doc.restore();
  }
}

function drawWatermark(doc, template, pageW, pageH) {
  const text = (template.watermark_text || '').trim();
  if (!text) return;

  const size = num(template.watermark_size, 72);
  doc.save();
  doc.opacity(clamp(num(template.watermark_opacity, 0.08), 0, 1));
  doc.rotate(-30, { origin: [pageW / 2, pageH / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(size)
    .fillColor(template.watermark_color || '#94a3b8')
    .text(text, 0, pageH / 2 - size * 0.6, { width: pageW, align: 'center', lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

// ---------------------------------------------------------------------------
// Field painting
// ---------------------------------------------------------------------------

async function drawField(doc, field, values, scaleX, scaleY) {
  const px = num(field.x) * scaleX;
  const py = num(field.y) * scaleY;
  const rotation = num(field.rotation, 0);
  const opacity = clamp(num(field.opacity, 1), 0, 1);

  doc.save();
  if (opacity < 1) doc.opacity(opacity);
  // PDFKit's positive rotation is clockwise in its top-left origin space, matching
  // the CSS `transform: rotate()` used on the Design Studio canvas.
  if (rotation) doc.rotate(rotation, { origin: [px, py] });

  try {
    switch (field.type) {
      case 'certificate_qr': {
        const size = num(field.width, 80) * scaleX;
        const buf = await qrBuffer(values);
        if (buf) doc.image(buf, px, py, { width: size, height: size });
        break;
      }

      case 'signature_image':
      case 'logo_image': {
        const buf = dataUrlToBuffer(field.image);
        if (!buf) break;
        const w = num(field.width, 160) * scaleX;
        const h = num(field.height, 60) * scaleY;
        doc.image(buf, px, py, { fit: [w, h], align: 'center', valign: 'center' });
        break;
      }

      case 'divider': {
        const w = num(field.width, 200) * scaleX;
        doc
          .moveTo(px, py)
          .lineTo(px + w, py)
          .lineWidth(Math.max(0.25, num(field.lineThickness, 1.5)))
          .strokeColor(field.lineColor || field.color || '#94a3b8')
          .stroke();
        break;
      }

      case 'text_block':
        drawTextBlock(doc, field, values, scaleX, scaleY, px, py);
        break;

      default:
        drawSingleLineText(doc, field, values, scaleX, scaleY, px, py);
        break;
    }
  } catch {
    /* never let one bad field abort the whole certificate */
  }

  doc.restore();
  doc.opacity(1);
}

function applyTextStyle(doc, field, scaleY) {
  const fontSize = Math.max(1, num(field.fontSize, 16) * scaleY);
  doc
    .font(resolvePdfFont(field.fontFamily, field.fontWeight, field.fontStyle))
    .fontSize(fontSize)
    .fillColor(field.color || '#111827');
    
  if (num(field.strokeWidth) > 0 && field.strokeColor) {
    doc.lineWidth(num(field.strokeWidth) * scaleY);
    doc.strokeColor(field.strokeColor);
  }
  return fontSize;
}

function drawSingleLineText(doc, field, values, scaleX, scaleY, px, py) {
  const text = applyTextTransform(resolveFieldText(field, values), field.textTransform);
  if (!text) return;

  const fontSize = applyTextStyle(doc, field, scaleY);
  const characterSpacing = num(field.letterSpacing, 0) * scaleX;
  const align = field.textAlign || 'left';
  const boxW = field.width ? num(field.width) * scaleX : 0;

  // Alignment is resolved by hand rather than delegated to PDFKit so it stays
  // exact with lineBreak:false (and matches the canvas byte for byte).
  let x = px;
  if (boxW > 0 && align !== 'left') {
    const textW = doc.widthOfString(text, { characterSpacing });
    x = align === 'center' ? px + (boxW - textW) / 2 : px + boxW - textW;
  }

  const options = {
    lineBreak: false,
    characterSpacing,
    underline: !!field.underline
  };
  
  if (num(field.strokeWidth) > 0) {
    options.stroke = true;
    options.fill = true;
  }

  if (field.shadowColor && num(field.shadowOffsetX) !== 0) {
    const sx = num(field.shadowOffsetX, 2) * scaleX;
    const sy = num(field.shadowOffsetY, 2) * scaleY;
    doc.fillColor(field.shadowColor);
    doc.text(text, x + sx, py + sy, { ...options, stroke: false });
    doc.fillColor(field.color || '#111827'); // restore
  }

  doc.text(text, x, py, options);
}

function drawTextBlock(doc, field, values, scaleX, scaleY, px, py) {
  const text = applyTextTransform(resolveFieldText(field, values), field.textTransform);
  if (!text) return;

  const fontSize = applyTextStyle(doc, field, scaleY);
  const advance = Math.max(0.1, num(field.lineHeight, 1.35)) * fontSize;
  
  const options = {
    width: Math.max(1, num(field.width, 300) * scaleX),
    align: field.textAlign || 'left',
    characterSpacing: num(field.letterSpacing, 0) * scaleX,
    lineGap: advance - doc.currentLineHeight(true),
    underline: !!field.underline
  };

  if (num(field.strokeWidth) > 0) {
    options.stroke = true;
    options.fill = true;
  }

  if (field.shadowColor && num(field.shadowOffsetX) !== 0) {
    const sx = num(field.shadowOffsetX, 2) * scaleX;
    const sy = num(field.shadowOffsetY, 2) * scaleY;
    doc.fillColor(field.shadowColor);
    doc.text(text, px + sx, py + sy, { ...options, stroke: false });
    doc.fillColor(field.color || '#111827'); // restore
  }

  doc.text(text, px, py, options);
}

// ---------------------------------------------------------------------------
// Essential field defaults — injected when a custom template omits them
// ---------------------------------------------------------------------------

// Centred column for auto-injected fields: x 96, width 600 centres text at 396 = 792/2
const COL = { x: 96, width: 600, textAlign: 'center' };

const ESSENTIAL_DEFAULTS = [
  { type: 'custom_text', ...COL, y: 78, text: 'Certificate of Achievement', fontSize: 28, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 3 },
  { type: 'custom_text', ...COL, y: 132, text: 'This certificate is proudly presented to', fontSize: 12, color: '#4b5563' },
  { type: 'recipient_name', ...COL, y: 162, fontSize: 40, fontWeight: 'bold', color: '#111827' },
  { type: 'custom_text', ...COL, y: 228, text: 'for outstanding performance as', fontSize: 11, color: '#4b5563' },
  { type: 'rank', ...COL, y: 250, fontSize: 18, fontWeight: 'bold' },
  { type: 'event_title', ...COL, y: 284, fontSize: 20, fontWeight: 'bold' },
  { type: 'issue_date', ...COL, y: 324, fontSize: 11, color: '#6b7280' },
  { type: 'issuer_name', x: 110, y: 432, width: 190, textAlign: 'center', fontSize: 12, fontWeight: 'bold' },
  { type: 'issuer_title', x: 110, y: 452, width: 190, textAlign: 'center', fontSize: 10, color: '#6b7280' },
  { type: 'certificate_qr', x: 620, y: 396, width: 84, height: 84 },
  { type: 'certificate_id', ...COL, y: 498, fontSize: 9, color: '#9ca3af' }
];

// Non-visual field types that carry certificate data (text, QR, etc.)
const DATA_FIELD_TYPES = new Set([
  'recipient_name', 'recipient_email', 'organization_name', 'rank', 'score',
  'event_title', 'issue_date', 'certificate_id', 'certificate_link',
  'certificate_qr', 'issuer_name', 'issuer_title', 'custom_text', 'text_block'
]);

/**
 * Returns the field list to render. If the template has at least one data/text
 * field, it is used as-is. Otherwise essential defaults are appended so the
 * certificate is never blank — the user's visual-only fields (logos, dividers)
 * are preserved and rendered first, then the injected text appears on top.
 */
function resolveFields(template) {
  const fields = (template && Array.isArray(template.fields)) ? template.fields : [];
  const hasDataFields = fields.some(f => DATA_FIELD_TYPES.has(f.type));
  if (hasDataFields) return fields;
  if (fields.length === 0) return [];

  // Template has visual fields (logos/dividers) but no text/data fields.
  // Inject essential defaults, applying the template's color scheme.
  const primary = template.primary_color || '#1e3a8a';
  const secondary = template.secondary_color || '#eab308';
  const injected = ESSENTIAL_DEFAULTS.map(f => {
    const clone = { ...f, id: `auto_${f.type}_${f.y}`, visible: true };
    // Apply the template's primary colour to heading-weight fields.
    if (!clone.color) {
      clone.color = (clone.fontWeight === 'bold' && clone.fontSize >= 18) ? primary : '#111827';
    }
    // Use the secondary colour for rank emphasis.
    if (clone.type === 'rank') clone.color = secondary;
    // Use the primary colour for the heading custom_text.
    if (clone.type === 'custom_text' && clone.fontSize >= 28) clone.color = primary;
    return clone;
  });
  return [...fields, ...injected];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function renderCertificatePdfBuffer(template, values) {
  if (require('worker_threads').isMainThread) {
    return require('../../services/isolatedWork').runIsolated('pdf', { template, values });
  }
  // values is an object keyed by field type:
  //   { recipient_name, email, event_title, issue_date, certificate_id, verification_url,
  //     organization_name, issuer_name, issuer_title, rank, score, ... }
  const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 0 });
  const path = require('path');
  const fs = require('fs');
  const fontsDir = path.join(__dirname, '..', '..', 'storage', 'fonts');
  if (fs.existsSync(fontsDir)) {
    try {
      doc.registerFont('Montserrat', path.join(fontsDir, 'Montserrat.ttf'));
      doc.registerFont('Montserrat-Italic', path.join(fontsDir, 'Montserrat-Italic.ttf'));
      doc.registerFont('PlayfairDisplay', path.join(fontsDir, 'PlayfairDisplay.ttf'));
      doc.registerFont('PlayfairDisplay-Italic', path.join(fontsDir, 'PlayfairDisplay-Italic.ttf'));
      doc.registerFont('GreatVibes', path.join(fontsDir, 'GreatVibes.ttf'));
      doc.registerFont('Oswald', path.join(fontsDir, 'Oswald.ttf'));
      doc.registerFont('Lato', path.join(fontsDir, 'Lato.ttf'));
      doc.registerFont('Lato-Bold', path.join(fontsDir, 'Lato-Bold.ttf'));
      doc.registerFont('Lato-Italic', path.join(fontsDir, 'Lato-Italic.ttf'));
      doc.registerFont('Lato-BoldItalic', path.join(fontsDir, 'Lato-BoldItalic.ttf'));
      doc.registerFont('Merriweather', path.join(fontsDir, 'Merriweather.ttf'));
      doc.registerFont('Merriweather-Bold', path.join(fontsDir, 'Merriweather-Bold.ttf'));
      doc.registerFont('Merriweather-Italic', path.join(fontsDir, 'Merriweather-Italic.ttf'));
      doc.registerFont('Merriweather-BoldItalic', path.join(fontsDir, 'Merriweather-BoldItalic.ttf'));
      doc.registerFont('Cinzel', path.join(fontsDir, 'Cinzel.ttf'));
      doc.registerFont('Lora', path.join(fontsDir, 'Lora.ttf'));
      doc.registerFont('Lora-Italic', path.join(fontsDir, 'Lora-Italic.ttf'));
      doc.registerFont('AlexBrush', path.join(fontsDir, 'AlexBrush.ttf'));
    } catch (e) {
      console.error('Warning: Failed to register custom fonts', e);
    }
  }

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  const fieldsToRender = resolveFields(template);
  const hasCustomFields = fieldsToRender.length > 0;

  if (hasCustomFields) {
    drawBackground(doc, template, pageW, pageH);
    drawBorders(doc, template, pageW, pageH);
    drawWatermark(doc, template, pageW, pageH);

    const scaleX = pageW / DESIGN_W;
    const scaleY = pageH / DESIGN_H;

    // Array order is paint order, i.e. the layer stack from the Design Studio.
    for (const f of fieldsToRender) {
      if (f.visible === false) continue;
      await drawField(doc, f, values, scaleX, scaleY);
    }
  } else {
    // Classic fallback layout, used when a template has no positioned fields.
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(4).strokeColor('#1e3a8a').stroke();
    doc.rect(38, 38, pageW - 76, pageH - 76).lineWidth(1.5).strokeColor('#eab308').stroke();

    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1e3a8a').text('CERTIFICATE OF APPRECIATION', 0, 90, { align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('This is proudly presented to', 0, 135, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(values.recipient_name || 'Recipient', 0, 175, { align: 'center' });
    doc.font('Helvetica').fontSize(13).fillColor('#374151').text(`for successfully participating and securing recognition as ${values.rank || 'Participant'} in`, 0, 230, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2563eb').text(values.event_title || 'Event', 0, 265, { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(`Issued Date: ${values.issue_date || ''} | Certificate ID: ${values.certificate_id || ''}`, 0, 310, { align: 'center' });

    const qr = await qrBuffer(values);
    if (qr) {
      try {
        doc.image(qr, pageW - 140, pageH - 160, { width: 80, height: 80 });
      } catch {}
    }

    doc.moveTo(100, 430).lineTo(280, 430).lineWidth(1).strokeColor('#9ca3af').stroke();
    doc.moveTo(pageW - 280, 430).lineTo(pageW - 100, 430).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937').text(values.issuer_name || 'Signatory', 100, 440, { width: 180, align: 'center' });
    doc.text('Authorized Signatory', pageW - 280, 440, { width: 180, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(values.issuer_title || '', 100, 455, { width: 180, align: 'center' });
    doc.text('CampusCertSystem Verified', pageW - 280, 455, { width: 180, align: 'center' });
  }

  doc.end();
  return done;
}

module.exports = {
  renderCertificatePdfBuffer,
  resolvePdfFont,
  resolveFieldText,
  sampleCertificateValues,
  borderLayers,
  DESIGN_W,
  DESIGN_H,
  BORDER_INSET
};
