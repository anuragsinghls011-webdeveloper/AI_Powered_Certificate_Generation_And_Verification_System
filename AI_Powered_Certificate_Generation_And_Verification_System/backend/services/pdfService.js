const PDFDocument = require('pdfkit');

/**
 * Generates a PDF certificate and streams it to the Express response.
 * Extracted from the inline PDF rendering in the old server.js download-pdf handler.
 *
 * @param {object} cert - Certificate document from MongoDB
 * @param {object|null} template - Template document from MongoDB
 * @param {object} res - Express response object
 */
function streamCertificatePdf(cert, template, res) {
  const doc = new PDFDocument({ layout: 'landscape', size: 'LETTER', margin: 0 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Certificate_${cert.cert_id}.pdf`);
  doc.pipe(res);

  const pageW = doc.page.width;   // 792 pt for landscape LETTER
  const pageH = doc.page.height;  // 612 pt

  // If template has custom fields, render them; else render default layout
  if (template && Array.isArray(template.fields) && template.fields.length > 0) {
    // Custom-designed template with drag-and-drop layout
    // Background image (if provided as data URL or http URL)
    if (template.background_image && template.background_image.startsWith('data:image')) {
      try {
        const b64 = template.background_image.split(',')[1];
        const imgBuf = Buffer.from(b64, 'base64');
        doc.image(imgBuf, 0, 0, { width: pageW, height: pageH });
      } catch (e) { /* ignore invalid image */ }
    }

    // Borders using template colors
    if (template.border_style && template.border_style !== 'none') {
      const borderColor = template.primary_color || '#1e3a8a';
      const accentColor = template.secondary_color || '#eab308';
      doc.rect(20, 20, pageW - 40, pageH - 40).lineWidth(4).strokeColor(borderColor).stroke();
      doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(1.5).strokeColor(accentColor).stroke();
    }

    // Canvas coords are in an 792x560 design space -> scale to PDF page
    const scaleX = pageW / 792;
    const scaleY = pageH / 560;

    for (const f of template.fields) {
      const px = (f.x || 0) * scaleX;
      const py = (f.y || 0) * scaleY;

      if (f.type === 'certificate_qr') {
        const qrPng = Buffer.from(cert.qr_code_b64, 'base64');
        const size = 80 * scaleX;
        doc.image(qrPng, px, py, { width: size, height: size });
        continue;
      }

      // Resolve dynamic text
      let text = '';
      switch (f.type) {
        case 'recipient_name': text = cert.recipient_name; break;
        case 'organization_name': text = cert.issuer_name; break;
        case 'rank': text = cert.role; break;
        case 'event_title': text = cert.event_title; break;
        case 'issue_date': text = cert.issue_date; break;
        case 'certificate_id': text = cert.cert_id; break;
        case 'certificate_link': text = cert.verification_url; break;
        case 'custom_text': text = f.text || ''; break;
        default: text = f.label || '';
      }

      let font = f.fontFamily || 'Helvetica';
      // Map bold/italic hints
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
    // Default classic layout (fallback)
    doc.rect(30, 30, pageW - 60, pageH - 60).lineWidth(4).strokeColor('#1e3a8a').stroke();
    doc.rect(38, 38, pageW - 76, pageH - 76).lineWidth(1.5).strokeColor('#eab308').stroke();

    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1e3a8a').text('CERTIFICATE OF APPRECIATION', 0, 90, { align: 'center' });
    doc.font('Helvetica').fontSize(14).fillColor('#4b5563').text('This is proudly presented to', 0, 135, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(32).fillColor('#111827').text(cert.recipient_name, 0, 175, { align: 'center' });
    doc.font('Helvetica').fontSize(13).fillColor('#374151').text(`for successfully participating and securing recognition as ${cert.role} in`, 0, 230, { align: 'center' });
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#2563eb').text(cert.event_title, 0, 265, { align: 'center' });
    doc.font('Helvetica').fontSize(11).fillColor('#6b7280').text(`Issued Date: ${cert.issue_date} | Certificate ID: ${cert.cert_id}`, 0, 310, { align: 'center' });

    // Embed QR code
    try {
      const qrPng = Buffer.from(cert.qr_code_b64, 'base64');
      doc.image(qrPng, pageW - 140, pageH - 160, { width: 80, height: 80 });
    } catch (e) { /* ignore */ }

    doc.moveTo(100, 430).lineTo(280, 430).lineWidth(1).strokeColor('#9ca3af').stroke();
    doc.moveTo(pageW - 280, 430).lineTo(pageW - 100, 430).stroke();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#1f2937').text(cert.issuer_name, 100, 440, { width: 180, align: 'center' });
    doc.text('Authorized Signatory', pageW - 280, 440, { width: 180, align: 'center' });
    doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text(cert.issuer_title, 100, 455, { width: 180, align: 'center' });
    doc.text('CampusCertSystem Verified', pageW - 280, 455, { width: 180, align: 'center' });
  }

  doc.end();
}

module.exports = { streamCertificatePdf };
