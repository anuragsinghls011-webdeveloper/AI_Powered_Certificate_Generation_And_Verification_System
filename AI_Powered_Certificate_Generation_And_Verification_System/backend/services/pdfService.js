const {
  renderCertificatePdfBuffer
} = require('../modules/bulkGeneration/certificateRenderer');

/**
 * Flattens a certificate document into the field-value map the shared renderer
 * expects. Keys mirror the field types available in the Design Studio.
 */
function certificateValues(cert) {
  return {
    recipient_name: cert.recipient_name,
    email: cert.recipient_email,
    organization_name: cert.issuer_name,
    issuer_name: cert.issuer_name,
    issuer_title: cert.issuer_title,
    rank: cert.role,
    score: cert.grade,
    event_title: cert.event_title,
    event_category: cert.event_category,
    issue_date: cert.issue_date,
    certificate_id: cert.cert_id,
    verification_url: cert.verification_url,
    qr_code_b64: cert.qr_code_b64
  };
}

/**
 * Generates a PDF certificate and sends it on the Express response.
 * Rendering itself lives in modules/bulkGeneration/certificateRenderer so that
 * single downloads, bulk jobs and the Design Studio preview stay identical.
 *
 * @param {object} cert - Certificate document from MongoDB
 * @param {object|null} template - Template document from MongoDB
 * @param {object} res - Express response object
 */
async function streamCertificatePdf(cert, template, res) {
  const buffer = await renderCertificatePdfBuffer(template, certificateValues(cert));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=Certificate_${cert.cert_id}.pdf`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

module.exports = { streamCertificatePdf, certificateValues };
