// Shared certificate PDF renderer — used by single-download endpoint AND bulk worker.
// Given a template document and a "field values" object, produces a PDF stream/buffer.

const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

async function renderCertificatePdfBuffer(template, values) {
  // values is an object keyed by field type:
  //   { recipient_name, email, event_title, issue_date, certificate_id, verification_url,
  //     organization_name, rank, custom_text, ... }
  const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 0 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageW = doc.page.width;
  const pageH = doc.page.height;

  const hasCustomFields = template && Array.isArray(template.fields) && template.fields.length > 0;

  if (hasCustomFields) {
    if (template.background_image && template.background_image.startsWith('data:image')) {
      try {
        const b64 = template.background_image.split(',')[1];
        doc.image(Buffer.from(b64, 'base64'), 0, 0, { width: pageW, height: pageH });
      } catch {}
    }

    if (template.border_style && template.border_style !== 'none') {
      const border = template.primary_color || '#1e3a8a';
      const accent = template.secondary_color || '#eab308';
      doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(4).strokeColor(border).stroke();
      doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(1.5).strokeColor(accent).stroke();
    }

    const scaleX = pageW / 792;
    const scaleY = pageH / 560;

    for (const f of template.fields) {
      const px = (f.x || 0) * scaleX;
      const py = (f.y || 0) * scaleY;

      if (f.type === 'certificate_qr') {
        const qrDataUrl = await QRCode.toDataURL(values.verification_url || 'unknown');
        const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
        const size = 80 * scaleX;
        doc.image(Buffer.from(b64, 'base64'), px, py, { width: size, height: size });
        continue;
      }

      const text = resolveFieldText(f, values);
      let font = f.fontFamily || 'Helvetica';
      if (f.fontWeight === 'bold' && !font.includes('Bold')) {
        if (font === 'Helvetica') font = 'Helvetica-Bold';
        else if (font === 'Times-Roman') font = 'Times-Bold';
        else if (font === 'Courier') font = 'Courier-Bold';
      }
      try { doc.font(font); } catch { doc.font('Helvetica'); }

      doc.fontSize((f.fontSize || 16) * scaleY)
        .fillColor(f.color || '#111827')
        .text(text || '', px, py, { lineBreak: false });
    }
  } else {
    // Classic fallback layout
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(4).strokeColor('#1e3a8a').stroke();
    doc.rect(38, 38, pageW - 76, pageH - 76).lineWidth(1.5).strokeColor('#eab308').stroke();

    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1e3a8a').text('CERTIFICATE OF APPRECIATION', 0, 90, { align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('This is proudly presented to', 0, 135, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(values.recipient_name || 'Recipient', 0, 175, { align: 'center' });
    doc.font('Helvetica').fontSize(13).fillColor('#374151').text(`for successfully participating as ${values.rank || 'Participant'} in`, 0, 230, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2563eb').text(values.event_title || 'Event', 0, 265, { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(`Issued Date: ${values.issue_date || ''} | Certificate ID: ${values.certificate_id || ''}`, 0, 310, { align: 'center' });

    try {
      const qrDataUrl = await QRCode.toDataURL(values.verification_url || 'unknown');
      const b64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
      doc.image(Buffer.from(b64, 'base64'), pageW - 140, pageH - 160, { width: 80, height: 80 });
    } catch {}

    doc.moveTo(100, 430).lineTo(280, 430).lineWidth(1).strokeColor('#9ca3af').stroke();
    doc.moveTo(pageW - 280, 430).lineTo(pageW - 100, 430).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937').text(values.issuer_name || 'Signatory', 100, 440, { width: 180, align: 'center' });
    doc.text('Authorized Signatory', pageW - 280, 440, { width: 180, align: 'center' });
  }

  doc.end();
  return done;
}

function resolveFieldText(field, values) {
  switch (field.type) {
    case 'recipient_name': return values.recipient_name || '';
    case 'organization_name': return values.organization_name || values.issuer_name || '';
    case 'rank': return values.rank || '';
    case 'event_title': return values.event_title || '';
    case 'issue_date': return values.issue_date || '';
    case 'certificate_id': return values.certificate_id || '';
    case 'certificate_link': return values.verification_url || '';
    case 'custom_text': return field.text || '';
    default: return field.label || '';
  }
}

module.exports = { renderCertificatePdfBuffer };
