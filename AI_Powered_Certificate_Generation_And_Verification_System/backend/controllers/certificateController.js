const QRCode = require('qrcode');
const crypto = require('crypto');
const { getCertificatesCol, getTemplatesCol } = require('../config/db');
const { generateCertId, todayISO, nowISO } = require('../utils/helpers');
const { scope, templateScope, scoped, id, issuanceResources } = require('../utils/tenant');
const { submitJob } = require('../services/jobSubmission');
const { streamCertificatePdf } = require('../services/pdfService');
const { deliverCertificate } = require('../services/certificateEmailService');
const limits = require('../config/security');
const handle = fn => async (req, res) => { try { await fn(req, res); } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Certificate operation failed' }); } };
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });
function participant(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw invalid('Invalid participant');
  for (const key of ['name', 'email', 'role', 'grade']) {
    if (row[key] !== undefined && (typeof row[key] !== 'string' || row[key].length > 500)) throw invalid('Invalid participant field');
  }
  if (!row.name?.trim()) throw invalid('Participant name is required');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) throw invalid('Invalid participant email');
  return { name: row.name.trim(), email: row.email || '', role: row.role || 'Participant', grade: row.grade || 'Completed Successfully' };
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
  res.json(await getCertificatesCol().find(query, { projection: { _id: 0 } }).toArray());
});
const generateBulkCertificates = handle(async (req, res) => {
  if (!Array.isArray(req.body.participants) || req.body.participants.length > limits.rows) throw Object.assign(new Error('Participant limit exceeded'), { statusCode: 413 });
  const rows = req.body.participants.map(participant);
  const job = await submitJob(req, { rows, event_id: req.body.event_id, template_id: req.body.template_id,
    mapping: { name: 'recipient_name', email: 'email', role: 'rank', grade: 'score' }, defaults: { issue_date: req.body.issue_date || todayISO() }, settings: { email_enabled: true, zip_enabled: true }, action: 'simple-bulk' });
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
  await getCertificatesCol().updateOne({ ...scope(req), cert_id: cert.cert_id }, { $set: { status: 'Revoked' } });
  res.json({ message: 'Certificate revoked successfully' });
});
const sendEmail = handle(async (req, res) => {
  const cert = await selectedCertificate(req);
  const template = await getTemplatesCol().findOne(scoped({ id: cert.template_id }, templateScope(req)));
  const result = await deliverCertificate({ cert, template });
  await getCertificatesCol().updateOne({ ...scope(req), cert_id: cert.cert_id }, { $set: {
    sent_email: result.delivered, email_status: result.delivered ? 'sent' : 'failed', email_id: result.email_id || null,
    email_actual_recipient: result.actual_recipients?.[0] || null, email_error: result.delivered ? null : 'Email delivery failed'
  } });
  if (!result.delivered) return res.status(502).json({ error: 'Certificate email could not be sent. Please retry.' });
  res.json({ message: 'Certificate email accepted', cert_id: cert.cert_id, email_id: result.email_id });
});
const downloadPdf = handle(async (req, res) => {
  const cert = await selectedCertificate(req);
  const template = await getTemplatesCol().findOne(scoped({ id: cert.template_id }, templateScope(req)));
  await streamCertificatePdf(cert, template, res);
});
module.exports = { getAllCertificates, generateBulkCertificates, createCertificate, getCertificateById, revokeCertificate, sendEmail, downloadPdf };