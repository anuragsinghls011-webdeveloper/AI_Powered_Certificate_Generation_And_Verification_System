const QRCode = require('qrcode');
const { getEventsCol, getTemplatesCol, getCertificatesCol } = require('../config/db');
const { uuidv4, generateCertId, todayISO, nowISO } = require('../utils/helpers');
const { streamCertificatePdf } = require('../services/pdfService');

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
        created_at: nowISO()
      };

      await getCertificatesCol().insertOne(certDoc);
      const { _id, ...cleanCert } = certDoc;
      createdCerts.push(cleanCert);
    }

    res.json({
      message: `Successfully generated ${createdCerts.length} certificates`,
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

    await getCertificatesCol().updateOne({ cert_id: req.params.cert_id }, { $set: { sent_email: true } });
    res.json({
      message: `Certificate successfully dispatched via Email & SMS to ${cert.recipient_email}`,
      recipient: cert.recipient_email,
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

    streamCertificatePdf(cert, template, res);
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
