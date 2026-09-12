const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const { randomUUID } = require('crypto');
const XLSX = require('xlsx');
const limits = require('../../config/security');
const { tenantDatabase, wrap, id, requirePermission } = require('../../utils/tenant');
const { workLimit, streamLease } = require('../../services/workload');
const { runIsolated } = require('../../services/isolatedWork');
const { submitJob, publicJob } = require('../../services/jobSubmission');
const { suggestMappings, REQUIRED } = require('./columnMapper');
const { validateRows, invertMapping } = require('./validationEngine');
const { renderCertificatePdfBuffer } = require('./certificateRenderer');
const { deliverCertificate } = require('../../services/certificateEmailService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: limits.uploadBytes, files: 1, fields: 4, parts: 5, fieldSize: 1024 },
  fileFilter: (req, file, cb) => cb(/\.(csv|xlsx)$/i.test(file.originalname) ? null : Object.assign(new Error('Only CSV and XLSX are supported'), { statusCode: 400 }), /\.(csv|xlsx)$/i.test(file.originalname))
});
const missing = () => Object.assign(new Error('Resource not found'), { statusCode: 404 });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function mappingInput(req) {
  const { mapping = {}, defaults = {} } = req.body || {};
  if (!object(mapping) || !object(defaults) || Object.keys(mapping).length > limits.columns || Object.values(defaults).some(v => typeof v !== 'string' || v.length > 500)) throw Object.assign(new Error('Invalid mapping or defaults'), { statusCode: 400 });
  return { mapping, defaults };
}
function pageArgs(req) {
  const page = Number(req.query.page || 1), size = Number(req.query.size || 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(size) || size < 1 || size > 200) throw Object.assign(new Error('Invalid pagination'), { statusCode: 400 });
  return { page, size };
}
function build(rawDb) {
  const router = express.Router();
  // Every handler gets a deny-by-default organization-scoped database facade.
  function route(method, url, permission, handler, cost) {
    router[method](url, requirePermission(permission), ...(cost ? [workLimit(cost)] : []), wrap(async (req, res) => {
      if (req.params.id) id(req.params.id);
      return handler(req, res, tenantDatabase(rawDb, req));
    }));
  }
  route('get', '/limits', 'bulk.read', (req, res) => res.json({ max_file_size: limits.uploadBytes, max_rows: limits.rows, max_columns: limits.columns, supported_formats: ['csv', 'xlsx'] }));
  route('get', '/sample-template', 'bulk.read', (req, res) => {
    const rows = [['Full Name', 'Email', 'Event', 'Department', 'Rank', 'Score', 'Issue Date'], ['Sample Recipient', 'recipient@example.com', 'Workshop', 'CSE', 'Participant', '90', '2026-09-01']];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    if (req.query.format === 'xlsx') {
      const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Participants');
      res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('bulk-participants-template.xlsx').send(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    } else res.type('text/csv').attachment('bulk-participants-template.csv').send(XLSX.utils.sheet_to_csv(sheet));
  });
  route('post', '/upload', 'bulk.create', async (req, res, db) => {
    await new Promise((resolve, reject) => upload.single('file')(req, res, error => error ? reject(Object.assign(error, { statusCode: 413 })) : resolve()));
    if (!req.file) throw Object.assign(new Error('No file uploaded'), { statusCode: 400 });
    const parsed = await runIsolated('parse', { buffer: req.file.buffer, name: req.file.originalname });
    const uploadId = randomUUID();
    await db.collection('bulk_uploads').insertOne({ id: uploadId, original_name: req.file.originalname, storage_path: null, file_size: req.file.size, headers: parsed.headers, rows: parsed.rows, row_count: parsed.rows.length, created_at: new Date().toISOString() });
    res.json({ upload_id: uploadId, file_name: req.file.originalname, file_size: req.file.size, headers: parsed.headers, row_count: parsed.rows.length, preview: parsed.rows.slice(0, 25) });
  }, 'upload');
  route('get', '/uploads/:id/preview', 'bulk.read', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id }); if (!doc) throw missing();
    const { page, size } = pageArgs(req);
    res.json({ file_name: doc.original_name, headers: doc.headers, total: doc.row_count, page, size, rows: doc.rows.slice((page - 1) * size, page * size) });
  });
  route('post', '/uploads/:id/suggest-mapping', 'bulk.read', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id }); if (!doc) throw missing();
    const template = req.body.template_id ? await db.collection('templates').findOne({ id: id(req.body.template_id) }) : null;
    if (req.body.template_id && !template) throw missing();
    const saved = await db.collection('bulk_saved_mappings').find({}).toArray();
    const match = saved.find(m => Object.keys(m.mapping || {}).sort().join('|') === [...doc.headers].sort().join('|'));
    const auto = suggestMappings(doc.headers, template?.fields || []);
    res.json({ auto_suggestions: auto.suggestions, unresolved_required: auto.unresolvedRequired, required_fields: auto.requiredFields, saved_mapping_match: match ? { name: match.name, mapping: match.mapping } : null });
  });
  route('post', '/uploads/:id/validate', 'bulk.create', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id }); if (!doc) throw missing();
    const { mapping, defaults } = mappingInput(req);
    const required = Array.isArray(req.body.required_fields) ? req.body.required_fields.filter(v => typeof v === 'string').slice(0, limits.columns) : [];
    const result = validateRows(doc.rows, mapping, [...new Set([...REQUIRED, ...required])], defaults);
    await db.collection('bulk_uploads').updateOne({ id: doc.id }, { $set: { last_validation: result.summary, last_mapping: mapping, last_defaults: defaults } });
    res.json(result);
  }, 'validate');
  route('get', '/uploads/:id/errors.csv', 'bulk.download', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: req.params.id }); if (!doc) throw missing();
    const { validated } = validateRows(doc.rows, doc.last_mapping || {}, Array.from(REQUIRED), doc.last_defaults || {});
    const inv = invertMapping(doc.last_mapping || {});
    const lines = ['Row,Name,Email,Error Code,Error Message'];
    for (const row of validated) for (const err of row.errors) lines.push(`${row.rowNumber},"${String(row.row[inv.recipient_name] || '').replace(/"/g, '""')}","${String(row.row[inv.email] || '').replace(/"/g, '""')}",${err.code},"${err.message.replace(/"/g, '""')}"`);
    res.type('text/csv').attachment(`errors-${req.params.id}.csv`).send(lines.join('\n'));
  }, 'export');
  route('post', '/preview-sample', 'bulk.create', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: id(req.body.upload_id) });
    const template = await db.collection('templates').findOne({ id: id(req.body.template_id) });
    if (!doc || !template) throw missing();
    const { mapping, defaults } = mappingInput(req), inv = invertMapping(mapping);
    const row = doc.rows[Math.min(doc.rows.length - 1, Math.max(0, Number(req.body.row_index) || 0))] || {};
    const pick = key => row[inv[key]] || defaults[key] || '';
    const pdf = await renderCertificatePdfBuffer(template, { recipient_name: pick('recipient_name') || 'Sample Recipient', email: pick('email'), event_title: pick('event_title'), issue_date: pick('issue_date'), rank: pick('rank'), score: pick('score'), certificate_id: 'CERT-SAMPLE', verification_url: `${process.env.APP_URL}/verify/CERT-SAMPLE`, issuer_name: template.issuer_name, issuer_title: template.issuer_title });
    res.type('application/pdf').send(pdf);
  }, 'pdf');
  route('get', '/saved-mappings', 'bulk.read', async (req, res, db) => res.json(await db.collection('bulk_saved_mappings').find({}, { projection: { _id: 0 } }).toArray()));
  route('post', '/saved-mappings', 'bulk.create', async (req, res, db) => {
    const { mapping, defaults } = mappingInput(req);
    const doc = { id: randomUUID(), name: String(req.body.name || 'Untitled Mapping').slice(0, 100), mapping, defaults, created_at: new Date().toISOString() };
    await db.collection('bulk_saved_mappings').insertOne(doc); res.json({ message: 'Mapping saved', mapping: doc });
  });
  route('delete', '/saved-mappings/:id', 'bulk.create', async (req, res, db) => {
    if (!(await db.collection('bulk_saved_mappings').deleteOne({ id: req.params.id })).deletedCount) throw missing();
    res.json({ message: 'Deleted' });
  });
  route('post', '/jobs', 'bulk.create', async (req, res, db) => {
    const doc = await db.collection('bulk_uploads').findOne({ id: id(req.body.upload_id) }); if (!doc) throw missing();
    const { mapping, defaults } = mappingInput(req);
    if (req.body.settings?.include_invalid) throw Object.assign(new Error('Invalid records cannot be generated'), { statusCode: 400 });
    const validation = validateRows(doc.rows, mapping, Array.from(REQUIRED), defaults);
    const rows = validation.validated.filter(r => r.status.startsWith('valid') || (r.status === 'duplicate' && req.body.skip_duplicates === false && r.errors.every(e => e.code === 'DUPLICATE'))).map(r => r.row);
    const job = await submitJob(req, { rows, mapping, defaults, event_id: req.body.event_id, template_id: req.body.template_id,
      settings: { email_enabled: req.body.settings?.email_enabled !== false, zip_enabled: req.body.settings?.zip_enabled !== false }, source: { upload_id: doc.id, name: doc.original_name } });
    res.status(202).json({ message: 'Bulk job queued', job_id: job.id, total_records: job.total_records });
  }, 'generation');
  route('get', '/jobs', 'bulk.read', async (req, res, db) => res.json((await db.collection('bulk_jobs').find({}).sort({ created_at: -1 }).limit(200).toArray()).map(publicJob)));
  route('get', '/jobs/:id', 'bulk.read', async (req, res, db) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id }); if (!job) throw missing();
    const groups = await db.collection('bulk_records').aggregate([{ $match: { job_id: job.id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]).toArray();
    res.json({ ...publicJob(job), record_counts: groups });
  });
  route('get', '/jobs/:id/records', 'bulk.read', async (req, res, db) => {
    if (!await db.collection('bulk_jobs').findOne({ id: req.params.id })) throw missing();
    const { page, size } = pageArgs(req), query = { job_id: req.params.id };
    if (req.query.status) {
      if (!['pending', 'success', 'failed'].includes(req.query.status)) throw Object.assign(new Error('Invalid status'), { statusCode: 400 });
      query.status = req.query.status;
    }
    const total = await db.collection('bulk_records').countDocuments(query);
    const rows = await db.collection('bulk_records').find(query, { projection: { _id: 0 } }).skip((page - 1) * size).limit(size).toArray();
    res.json({ total, page, size, rows });
  });
  route('post', '/jobs/:id/retry', 'bulk.create', async (req, res, db) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id }); if (!job) throw missing();
    const result = await db.collection('bulk_jobs').updateOne({ id: job.id, status: { $in: ['failed', 'completed_with_errors'] }, attempts: { $lt: limits.jobAttempts }, submission_key: { $type: 'string' } }, { $set: { status: 'queued', next_attempt_at: new Date(), cancel_requested: false, completed_at: null } });
    if (!result.modifiedCount) throw Object.assign(new Error('Job is not retryable or retry limit reached'), { statusCode: 409 });
    await db.collection('audit_logs').insertOne({ action: 'BULK_GENERATION_RETRIED', job_id: job.id, timestamp: new Date().toISOString() });
    res.status(202).json({ message: 'Retry queued' });
  }, 'generation');
  route('post', '/jobs/:id/cancel', 'bulk.cancel', async (req, res, db) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id }); if (!job) throw missing();
    const result = await db.collection('bulk_jobs').updateOne({ id: job.id, status: { $in: ['queued', 'processing'] } }, { $set: { cancel_requested: true } });
    if (!result.matchedCount) throw Object.assign(new Error('Job already finished'), { statusCode: 409 });
    await db.collection('audit_logs').insertOne({ action: 'BULK_GENERATION_CANCELLED', job_id: job.id, timestamp: new Date().toISOString() });
    res.json({ message: 'Cancellation requested' });
  });
  route('get', '/jobs/:id/download', 'bulk.download', async (req, res, db) => {
    if (!await db.collection('bulk_jobs').findOne({ id: req.params.id })) throw missing();
    const rows = await db.collection('bulk_records').find({ job_id: req.params.id, status: 'success' }).limit(limits.rows).toArray();
    if (!rows.length) throw Object.assign(new Error('No successful certificates to download yet'), { statusCode: 400 });
    if (rows.some(r => !r.pdf_path || !fs.existsSync(r.pdf_path))) throw Object.assign(new Error('Certificate artifact unavailable'), { statusCode: 409 });
    await streamLease(res);
    res.type('application/zip').attachment(`${req.params.id}.zip`);
    const archive = archiver('zip', { zlib: { level: 6 } });
    res.once('close', () => archive.abort()); archive.on('error', () => res.destroy()); archive.pipe(res);
    for (const record of rows) archive.file(record.pdf_path, { name: `${record.certificate_id}.pdf` });
    const lines = ['certificate_id,recipient_name,email,status,email_status,pdf_hash'];
    for (const r of rows) lines.push([r.certificate_id, String(Object.values(r.row || {})[0] || '').replace(/,/g, ' '), '', r.status, r.email_status || '', r.pdf_hash || ''].join(','));
    archive.append(lines.join('\n'), { name: 'summary.csv' }); await archive.finalize();
    await db.collection('audit_logs').insertOne({ action: 'BULK_CERTIFICATES_DOWNLOADED', job_id: req.params.id, count: rows.length, timestamp: new Date().toISOString() });
  }, 'export');
  route('post', '/jobs/:id/resend-emails', 'certificates.create', async (req, res, db) => {
    const job = await db.collection('bulk_jobs').findOne({ id: req.params.id }); if (!job) throw missing();
    const records = await db.collection('bulk_records').find({ job_id: job.id, status: 'success', email_status: { $in: ['failed', 'queued'] } }).limit(limits.rateLimit).toArray();
    let sent = 0, failed = 0;
    for (const record of records) {
      const cert = await db.collection('certificates').findOne({ cert_id: record.certificate_id });
      if (!cert || !record.pdf_path || !fs.existsSync(record.pdf_path)) { failed++; continue; }
      const template = await db.collection('templates').findOne({ id: cert.template_id });
      const result = await deliverCertificate({ cert, template, pdfBuffer: fs.readFileSync(record.pdf_path) });
      const patch = { email_status: result.delivered ? 'sent' : 'failed', email_id: result.email_id || null, email_error: result.delivered ? null : 'Email delivery failed' };
      await db.collection('bulk_records').updateOne({ _id: record._id }, { $set: patch });
      await db.collection('certificates').updateOne({ cert_id: cert.cert_id }, { $set: { ...patch, sent_email: result.delivered } });
      result.delivered ? sent++ : failed++;
    }
    await db.collection('audit_logs').insertOne({ action: 'BULK_EMAILS_RESENT', job_id: job.id, count: sent, failed, timestamp: new Date().toISOString() });
    res.json({ message: `Accepted ${sent} email(s); ${failed} failed.`, sent, failed, remaining: await db.collection('bulk_records').countDocuments({ job_id: job.id, status: 'success', email_status: { $in: ['failed', 'queued'] } }) });
  }, 'email');
  route('get', '/analytics', 'analytics.read', async (req, res, db) => {
    const jobs = await db.collection('bulk_jobs').find({}).toArray();
    const generated = jobs.reduce((sum, j) => sum + (j.successful_records || 0), 0), failed = jobs.reduce((sum, j) => sum + (j.failed_records || 0), 0);
    res.json({ total_jobs: jobs.length, total_generated: generated, total_failed: failed, success_rate: generated + failed ? Math.round(generated * 1000 / (generated + failed)) / 10 : 100 });
  });
  return router;
}
module.exports = { build };