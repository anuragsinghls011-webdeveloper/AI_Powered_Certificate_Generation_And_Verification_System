const QRCode = require('qrcode');
const { getEventsCol, getTemplatesCol, getCertificatesCol } = require('../config/db');
const { uuidv4, generateCertId, todayISO, nowISO } = require('../utils/helpers');
const { streamCertificatePdf } = require('../services/pdfService');
const { renderCertificatePdfBuffer } = require('../modules/bulkGeneration/certificateRenderer');
const { deliverCertificate, certificateValues } = require('../services/certificateEmailService');

// GET /api/certificates
async function getAllCertificates(req, res) {
  try {
    const { event_id, search } = req.query;
    let query = {};
    if (event_id) query.event_id = event_id;
    if (search) {
      query.$or = [
        { recipient_name: { $regex: search, $options: 'i' } },
        { recipient_email: { $regex: search, $options: 'i' } },
        { cert_id: { $regex: search, $options: 'i' } }
      ];
    }
    const certs = await getCertificatesCol().find(query, { projection: { _id: 0 } }).toArray();
    res.json(certs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/certificates/generate-bulk
async function generateBulkCertificates(req, res) {
  try {
    const { event_id, template_id, participants, issue_date } = req.body;
    const event = await getEventsCol().findOne({ id: event_id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const template = await getTemplatesCol().findOne({ id: template_id });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const createdCerts = [];
    for (const p of participants) {
      const certId = generateCertId();
      const verificationUrl = `https://certverify.campus.edu/verify/${certId}`;
      const qrCodeB64 = await QRCode.toDataURL(verificationUrl);

      const certDoc = {
        cert_id: certId,
        event_id,
        event_title: event.title,
        event_category: event.category,
        template_id,
        recipient_name: p.name,
        recipient_email: p.email,
        role: p.role || 'Participant',
        grade: p.grade || 'Completed Successfully',
        issue_date: issue_date || todayISO(),
        issuer_name: template.issuer_name || 'Dean of Academic Affairs',
        issuer_title: template.issuer_title || 'University Chancellor',
        verification_url: verificationUrl,
        qr_code_b64: qrCodeB64.replace(/^data:image\/png;base64,/, ''),
        status: 'Active',
        sent_email: false,
        email_status: p.email ? 'queued' : 'skipped',
        created_at: nowISO()
      };

      await getCertificatesCol().insertOne(certDoc);
      if (p.email) {
        const pdfBuffer = await renderCertificatePdfBuffer(template, certificateValues(certDoc));
        const delivery = await deliverCertificate({ cert: certDoc, template, pdfBuffer });
        certDoc.sent_email = delivery.delivered;
        certDoc.email_status = delivery.delivered ? 'sent' : 'failed';
        certDoc.email_id = delivery.email_id || null;
        certDoc.email_actual_recipient = delivery.actual_recipients?.[0] || null;
        certDoc.email_error = delivery.delivered ? null : delivery.error;
        await getCertificatesCol().updateOne({ cert_id: certId }, { $set: {
          sent_email: certDoc.sent_email,
          email_status: certDoc.email_status,
          email_id: certDoc.email_id,
          email_actual_recipient: certDoc.email_actual_recipient,
          email_error: certDoc.email_error
        } });
      }
      const { _id, ...cleanCert } = certDoc;
      createdCerts.push(cleanCert);
    }

    res.json({
      message: `Generated ${createdCerts.length} certificates; ${createdCerts.filter(cert => cert.email_status === 'sent').length} email(s) delivered.`,
      count: createdCerts.length,
      certificates: createdCerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/certificates
async function createCertificate(req, res) {
  try {
    const { event_id, template_id, name, email, role, grade, issue_date } = req.body;
    const event = await getEventsCol().findOne({ id: event_id });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const template = await getTemplatesCol().findOne({ id: template_id });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const certId = generateCertId();
    const verificationUrl = `https://certverify.campus.edu/verify/${certId}`;
    const qrCodeB64 = await QRCode.toDataURL(verificationUrl);

    const certDoc = {
      cert_id: certId,
      event_id,
      event_title: event.title,
      event_category: event.category,
      template_id,
      recipient_name: name,
      recipient_email: email,
      role: role || 'Participant',
      grade: grade || 'Completed Successfully',
      issue_date: issue_date || todayISO(),
      issuer_name: template.issuer_name || 'Dean of Academic Affairs',
      issuer_title: template.issuer_title || 'University Chancellor',
      verification_url: verificationUrl,
      qr_code_b64: qrCodeB64.replace(/^data:image\/png;base64,/, ''),
      status: 'Active',
      sent_email: false,
      created_at: nowISO()
    };

    await getCertificatesCol().insertOne(certDoc);
    const { _id, ...cleanCert } = certDoc;
    res.json({ message: 'Certificate issued successfully', certificate: cleanCert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/certificates/:cert_id
async function getCertificateById(req, res) {
  try {
    const cert = await getCertificatesCol().findOne({ cert_id: req.params.cert_id }, { projection: { _id: 0 } });
    if (!cert) return res.status(404).json({ error: 'Certificate not found or invalid ID' });
    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/certificates/:cert_id (revoke)
async function revokeCertificate(req, res) {
  try {
    const result = await getCertificatesCol().updateOne({ cert_id: req.params.cert_id }, { $set: { status: 'Revoked' } });
    if (result.matchedCount === 0) return res.status(404).json({ error: 'Certificate not found' });
    res.json({ message: 'Certificate revoked successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/certificates/:cert_id/send-email
async function sendEmail(req, res) {
  try {
    const cert = await getCertificatesCol().findOne({ cert_id: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const template = await getTemplatesCol().findOne({ id: cert.template_id });
    const delivery = await deliverCertificate({ cert, template });
    const emailStatus = delivery.delivered ? 'sent' : 'failed';
    await getCertificatesCol().updateOne({ cert_id: req.params.cert_id }, { $set: {
      sent_email: delivery.delivered,
      email_status: emailStatus,
      email_id: delivery.email_id || null,
      email_actual_recipient: delivery.actual_recipients?.[0] || null,
      email_error: delivery.delivered ? null : delivery.error
    } });
    if (!delivery.delivered) return res.status(502).json({ error: 'Certificate email could not be delivered. Please retry.' });
    res.json({
      message: `Certificate email delivered for ${cert.recipient_email}`,
      recipient: cert.recipient_email,
      delivery_recipient: delivery.actual_recipients?.[0],
      email_id: delivery.email_id,
      cert_id: req.params.cert_id
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// GET /api/certificates/:cert_id/download-pdf
async function downloadPdf(req, res) {
  try {
    const cert = await getCertificatesCol().findOne({ cert_id: req.params.cert_id });
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });

    const template = await getTemplatesCol().findOne({ id: cert.template_id });

    await streamCertificatePdf(cert, template, res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getAllCertificates,
  generateBulkCertificates,
  createCertificate,
  getCertificateById,
  revokeCertificate,
  sendEmail,
  downloadPdf
};
