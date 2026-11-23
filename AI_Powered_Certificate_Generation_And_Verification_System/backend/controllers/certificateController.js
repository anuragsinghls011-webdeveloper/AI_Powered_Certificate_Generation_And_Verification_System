const QRCode = require('qrcode');
const crypto = require('crypto');
const { getCertificatesCol, getTemplatesCol, getDB } = require('../config/db');
const { generateCertId, todayISO, nowISO } = require('../utils/helpers');
const { scope, templateScope, scoped, id, issuanceResources } = require('../utils/tenant');
const { submitJob } = require('../services/jobSubmission');
const { streamCertificatePdf } = require('../services/pdfService');
const { deliverCertificate } = require('../services/certificateEmailService');
const { addCertificateJob, addEmailJob } = require('../queues');
const { redisHealthCheck } = require('../config/redis');
const { logAudit } = require('../utils/audit');
const storageService = require('../services/storageService');
const limits = require('../config/security');
const handle = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Certificate operation failed' }); } };
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
function participant(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid('Invalid participant');
  const clean = {};
  for (const [key, val] of Object.entries(row)) {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string' || val.length > 500) throw invalid(`Invalid participant field: ${key}`);
      clean[key] = val.trim();
    }
  }
  const nameField = clean.recipient_name || clean.name || clean.fullname || clean.full_name || clean.student_name;
  if (!nameField) throw invalid('Participant name is required');
  clean.name = nameField;
  clean.recipient_name = nameField;

  const emailField = clean.recipient_email || clean.email || clean.email_id || clean.mail;
  if (emailField) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField)) throw invalid('Invalid participant email');
    clean.email = emailField;
    clean.recipient_email = emailField;
  }
  return clean;
}
async function selectedCertificate(req) {
  const cert = await getCertificatesCol().findOne({ ...scope(req), cert_id: id(req.params.cert_id) }, { projection: { _id: 0 } });
  if (!cert) throw Object.assign(new Error('Certificate not found'), { statusCode: 404 });
  return cert;
}
const getAllCertificates = handle(async (req, res) => {
  const query = scope(req);
  if (req.query.event_id) query.event_id = id(req.query.event_id);
  if (req.query.search) {
    if (typeof req.query.search !== 'string' || req.query.search.length > 100) throw invalid('Invalid search');
    const search = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    query.$or = ['recipient_name', 'recipient_email', 'cert_id'].map(key => ({ [key]: { $regex: search, $options: 'i' } }));
  }
  const listFields = { _id: 0, cert_id: 1, recipient_name: 1, recipient_email: 1, event_id: 1,
    event_title: 1, role: 1, issue_date: 1, status: 1, template_id: 1 };
  const collection = getCertificatesCol();
  if (req.query.page !== undefined) {
    const page = Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000000) throw invalid('Invalid page');
    const size = 10;
    const [items, total] = await Promise.all([
      collection.find(query, { projection: listFields }).sort({ created_at: -1, cert_id: 1 })
        .skip((page - 1) * size).limit(size).toArray(),
      collection.countDocuments(query)
    ]);
    return res.json({ items, total });
  }
  let cursor = collection.find(query, { projection: req.query.view === 'list' ? listFields : { _id: 0 } }).sort({ created_at: -1 });
  if (req.query.limit) {
    const limitNum = Math.min(Math.max(1, parseInt(req.query.limit, 10) || 50), 1000);
    cursor = cursor.limit(limitNum);
  }
  res.json(await cursor.toArray());
});
const generateBulkCertificates = handle(async (req, res) => {
  if (!Array.isArray(req.body.participants) || req.body.participants.length > limits.rows) throw Object.assign(new Error('Participant limit exceeded'), { statusCode: 413 });
  const rows = req.body.participants.map(participant);
  
  // Use mapping from request if provided, otherwise assume keys map to themselves 1:1
  const providedMapping = req.body.mapping || {};
  const mapping = Object.keys(providedMapping).length > 0 
    ? providedMapping 
    : { name: 'recipient_name', email: 'email', role: 'rank', grade: 'score' }; // Fallback for old frontend versions
    
  const job = await submitJob(req, { rows, event_id: req.body.event_id, template_id: req.body.template_id,
    mapping, defaults: { issue_date: req.body.issue_date || todayISO() }, settings: { email_enabled: false, zip_enabled: true }, action: 'simple-bulk' });

  // Push to BullMQ queue
  try {
    if (await redisHealthCheck()) {
      await addCertificateJob({
        jobId: job.id,
        organizationId: req.organization.id,
        createdBy: req.user.id
      });
    }
  } catch (queueError) {
    console.warn('[CertCtrl] BullMQ enqueue failed:', queueError.message);
  }

  res.status(202).json({ message: 'Certificate job queued', job_id: job.id, count: job.total_records });
});
const createCertificate = handle(async (req, res) => {
  const p = participant(req.body);
  const { event, template } = await issuanceResources(req, req.body.event_id, req.body.template_id);
  const fields = { event_id: event.id, template_id: template.id, ...p, issue_date: req.body.issue_date || todayISO() };
  if (typeof fields.issue_date !== 'string' || fields.issue_date.length > 40) throw invalid('Invalid issue date');
  const bodyHash = crypto.createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  const key = req.get('Idempotency-Key');
  if (key !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw invalid('Invalid idempotency key');
  const issuanceKey = crypto.createHash('sha256').update(`${req.organization.id}:${req.user.id}:single:${key || bodyHash}`).digest('hex');
  const certId = generateCertId();
  const verificationUrl = `${limits.appUrl}/verify/${certId}`;
  const qr = await QRCode.toDataURL(verificationUrl);
  const doc = {
    ...scope(req), created_by: req.user.id, issuance_key: issuanceKey, request_hash: bodyHash,
    cert_id: certId, event_id: event.id, event_title: event.title, event_category: event.category,
    template_id: template.id, recipient_name: p.name, recipient_email: p.email, role: p.role, grade: p.grade,
    issue_date: fields.issue_date, issuer_name: template.issuer_name, issuer_title: template.issuer_title,
    verification_url: verificationUrl, qr_code_b64: qr.replace(/^data:image\/png;base64,/, ''), status: 'Active', sent_email: false, created_at: nowISO()
  };
  try { await getCertificatesCol().updateOne({ issuance_key: issuanceKey }, { $setOnInsert: doc }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const cert = await getCertificatesCol().findOne({ ...scope(req), issuance_key: issuanceKey }, { projection: { _id: 0 } });
  if (cert.request_hash !== bodyHash) throw Object.assign(new Error('Idempotency key already used with different content'), { statusCode: 409 });
  res.json({ message: 'Certificate issued successfully', certificate: cert });
});
const getCertificateById = handle(async (req, res) => res.json(await selectedCertificate(req)));
const revokeCertificate = handle(async (req, res) => {
  const cert = await selectedCertificate(req);
  if (cert.status !== 'Revoked') {
    const result = await getCertificatesCol().updateOne(
      { ...scope(req), cert_id: cert.cert_id, status: { $ne: 'Revoked' } },
      { $set: { status: 'Revoked', revoked_at: nowISO(), revoked_by: req.user.id } }
    );
    if (result.modifiedCount) await logAudit(getDB(), {
      action: 'CERTIFICATE_REVOKED', organization_id: req.organization.id,
      user_id: req.user.id, cert_id: cert.cert_id
    });
  }
  res.json({ message: 'Certificate revoked successfully' });
});
const revokeBulkCertificates = handle(async (req, res) => {
  const { cert_ids } = req.body || {};
  if (!Array.isArray(cert_ids) || cert_ids.length === 0 || cert_ids.length > 5000 ||
      cert_ids.some(certId => typeof certId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(certId))) {
    throw invalid('Invalid or too many certificate IDs');
  }
  const result = await getCertificatesCol().updateMany(
    { ...scope(req), cert_id: { $in: cert_ids }, status: { $ne: 'Revoked' } },
    { $set: { status: 'Revoked', revoked_at: nowISO(), revoked_by: req.user.id } }
  );
  if (result.modifiedCount) await logAudit(getDB(), {
    action: 'CERTIFICATES_BULK_REVOKED', organization_id: req.organization.id,
    user_id: req.user.id, cert_ids, count: result.modifiedCount
  });
  res.json({ message: `${result.modifiedCount} certificates revoked successfully`, revoked_count: result.modifiedCount });
});
const sendEmail = handle(async (req, res) => {
  const cert = await selectedCertificate(req);
  if (cert.status === 'Revoked') return res.status(409).json({ error: 'Revoked certificates cannot be emailed' });

  // Queue via BullMQ if available (non-blocking)
  if (await redisHealthCheck()) {
    await addEmailJob({
      certId: cert.cert_id,
      organizationId: cert.organization_id,
      recordId: null,
      jobId: null
    });
    await getCertificatesCol().updateOne(
      { ...scope(req), cert_id: cert.cert_id },
      { $set: { email_status: 'queued' } }
    );
    return res.json({ message: 'Certificate email queued for delivery', cert_id: cert.cert_id, queued: true });
  }

  const template = await getTemplatesCol().findOne(scoped({ id: cert.template_id }, templateScope(req)));
  let pdfBuffer;
  if (!template && cert.pdf_path) {
    try { pdfBuffer = await storageService.getPdfBuffer(cert.pdf_path); } catch (_) {}
  }
  if (!template && !pdfBuffer) return res.status(404).json({ error: 'Certificate template not found' });
  const result = await deliverCertificate({ cert, template, pdfBuffer });
  await getCertificatesCol().updateOne({ ...scope(req), cert_id: cert.cert_id }, { $set: {
    sent_email: result.delivered, email_status: result.delivered ? 'sent' : 'failed', email_id: result.email_id || null,
    email_actual_recipient: result.actual_recipients?.[0] || null, email_error: result.delivered ? null : 'Email delivery failed'
  } });
  if (!result.delivered) return res.status(502).json({ error: result.error || 'Certificate email could not be sent. Please retry.' });
  res.json({ message: 'Certificate email accepted', cert_id: cert.cert_id, email_id: result.email_id });
});
const downloadPdf = handle(async (req, res) => {
  const cert = await selectedCertificate(req);
  if (cert.status === 'Revoked') return res.status(409).json({ error: 'Revoked certificates cannot be downloaded' });
  if (cert.pdf_path) {
    try {
      const { stream, length } = await storageService.downloadPdfStream(cert.pdf_path);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=Certificate_${cert.cert_id}.pdf`);
      if (length) res.setHeader('Content-Length', length);
      return stream.pipe(res);
    } catch (e) {
      console.warn('Failed to fetch PDF from storage, generating on-the-fly:', e.message);
    }
  }
  const template = await getTemplatesCol().findOne(scoped({ id: cert.template_id }, templateScope(req)));
  if (!template) return res.status(404).json({ error: 'Certificate template not found' });
  await streamCertificatePdf(cert, template, res);
});
module.exports = { getAllCertificates, generateBulkCertificates, createCertificate, getCertificateById, revokeCertificate, revokeBulkCertificates, sendEmail, downloadPdf };
