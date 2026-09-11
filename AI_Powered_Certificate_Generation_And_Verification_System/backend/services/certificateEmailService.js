const { renderCertificatePdfBuffer } = require('../modules/bulkGeneration/certificateRenderer');
const { sendEmail } = require('../utils/emailService');
const { certificateTemplate } = require('./emailTemplates');

function certificateValues(cert) {
  return {
    recipient_name: cert.recipient_name,
    email: cert.recipient_email,
    event_title: cert.event_title,
    issue_date: cert.issue_date,
    certificate_id: cert.cert_id,
    verification_url: cert.verification_url,
    issuer_name: cert.issuer_name,
    issuer_title: cert.issuer_title,
    rank: cert.role,
    score: cert.grade,
    qr_code_b64: cert.qr_code_b64
  };
}

async function deliverCertificate({ cert, template, pdfBuffer }) {
  if (!cert.recipient_email) return { delivered: false, skipped: true, error: 'Recipient email is missing' };
  const pdf = pdfBuffer || await renderCertificatePdfBuffer(template, certificateValues(cert));
  const content = certificateTemplate({
    recipientName: cert.recipient_name,
    eventTitle: cert.event_title,
    certificateId: cert.cert_id,
    verificationUrl: cert.verification_url
  });
  return sendEmail({
    to: cert.recipient_email,
    ...content,
    attachments: [{ filename: `${cert.cert_id}.pdf`, content: pdf }],
    idempotencyKey: `certificate/${cert.cert_id}/delivery-v1`
  });
}

module.exports = { deliverCertificate, certificateValues };