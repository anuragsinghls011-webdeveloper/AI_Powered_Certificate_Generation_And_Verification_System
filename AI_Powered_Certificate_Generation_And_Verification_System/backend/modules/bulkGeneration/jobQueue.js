// MongoDB-backed worker: leased job ownership, stable row identities and idempotent issuance.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { renderCertificatePdfBuffer } = require('./certificateRenderer');
const { invertMapping } = require('./validationEngine');
const { deliverCertificate } = require('../../services/certificateEmailService');
const { acquireSlot } = require('../../services/workload');
const config = require('../../config/security');
const now = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const terminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'];

function sanitizeFileName(name) {
  return String(name || 'certificate').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'certificate';
}
async function nextCertificateId(db) {
  const year = new Date().getFullYear();
  const counter = await db.collection('counters').findOneAndUpdate({ _id: `cert_${year}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return `CERT-${year}-${String(counter.seq).padStart(6, '0')}`;
}
function valuesFor(job, record, certId) {
  const inv = invertMapping(job.mapping);
  const pick = field => String(record.row[inv[field]] ?? job.defaults[field] ?? '').trim();
  return {
    recipient_name: pick('recipient_name'), email: pick('email'),
    event_title: job.event_snapshot.title, event_category: job.event_snapshot.category,
    issue_date: pick('issue_date') || job.created_at.slice(0, 10),
    organization_name: pick('organization_name'), rank: pick('rank') || 'Participant', score: pick('score'),
    certificate_id: certId, verification_url: `${process.env.APP_URL}/verify/${certId}`,
    issuer_name: job.template_snapshot.issuer_name, issuer_title: job.template_snapshot.issuer_title
  };
}
async function owned(db, job, owner) {
  const current = await db.collection('bulk_jobs').findOne({ id: job.id, organization_id: job.organization_id, lease_owner: owner, status: 'processing', lease_until: { $gt: new Date() } });
  if (!current) throw new Error('Worker lease lost');
  return current;
}
async function counts(db, job) {
  const q = { job_id: job.id, organization_id: job.organization_id };
  const [successful, failed] = await Promise.all([
    db.collection('bulk_records').countDocuments({ ...q, status: 'success' }),
    db.collection('bulk_records').countDocuments({ ...q, status: 'failed' })
  ]);
  return { successful_records: successful, failed_records: failed, processed_records: successful + failed };
}
async function processRecord(db, job, record, owner) {
  await owned(db, job, owner);
  let certId = record.certificate_id;
  if (!certId) {
    const candidate = await nextCertificateId(db);
    const stored = await db.collection('bulk_records').findOneAndUpdate({ _id: record._id, organization_id: job.organization_id, certificate_id: null }, { $set: { certificate_id: candidate } }, { returnDocument: 'after' });
    certId = stored?.certificate_id || (await db.collection('bulk_records').findOne({ _id: record._id })).certificate_id;
  }
  const values = valuesFor(job, record, certId);
  if (!values.recipient_name) throw new Error('Recipient name is required');
  const directory = path.join(config.certDir, job.id);
  fs.mkdirSync(directory, { recursive: true });
  // Stable immutable row key: an ambiguous display filename cannot alias another row.
  const filePath = path.join(directory, `${record._id}.pdf`);
  const pdf = fs.existsSync(filePath) ? fs.readFileSync(filePath) : await renderCertificatePdfBuffer(job.template_snapshot, values);
  await owned(db, job, owner);
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, pdf, { flag: 'wx', mode: 0o600 });
  const qr = await QRCode.toDataURL(values.verification_url);
  const certificate = {
    issuance_key: record._id, organization_id: job.organization_id, created_by: job.created_by,
    cert_id: certId, event_id: job.event_id, event_title: values.event_title, event_category: values.event_category,
    template_id: job.template_id, recipient_name: values.recipient_name, recipient_email: values.email,
    role: values.rank, grade: values.score || 'Completed Successfully', issue_date: values.issue_date,
    issuer_name: values.issuer_name, issuer_title: values.issuer_title,
    verification_url: values.verification_url, qr_code_b64: qr.replace(/^data:image\/png;base64,/, ''),
    status: 'Active', pdf_hash: hash(pdf), pdf_path: filePath, bulk_job_id: job.id,
    sent_email: false, email_status: job.settings.email_enabled !== false && values.email ? 'queued' : 'skipped', created_at: job.created_at
  };
  await owned(db, job, owner);
  try { await db.collection('certificates').updateOne({ issuance_key: record._id }, { $setOnInsert: certificate }, { upsert: true }); }
  catch (error) { if (error.code !== 11000) throw error; }
  const stored = await db.collection('certificates').findOne({ issuance_key: record._id, organization_id: job.organization_id });
  let emailStatus = stored.email_status;
  if (job.settings.email_enabled !== false && values.email && emailStatus !== 'sent') {
    await owned(db, job, owner);
    const result = await deliverCertificate({ cert: stored, template: job.template_snapshot, pdfBuffer: pdf });
    await owned(db, job, owner);
    emailStatus = result.delivered ? 'sent' : 'failed';
    await db.collection('certificates').updateOne({ issuance_key: record._id, organization_id: job.organization_id }, { $set: {
      sent_email: result.delivered, email_status: emailStatus, email_id: result.email_id || null,
      email_actual_recipient: result.actual_recipients?.[0] || null, email_error: result.delivered ? null : 'Email delivery failed'
    } });
  }
  await owned(db, job, owner);
  await db.collection('bulk_records').updateOne({ _id: record._id, organization_id: job.organization_id }, { $set: {
    status: 'success', certificate_id: certId, pdf_path: filePath, pdf_hash: hash(pdf), email_status: emailStatus, error: null, processed_at: now()
  } });
}
async function processJob(db, job, owner) {
  await owned(db, job, owner);
  if (!Array.isArray(job.input_rows) || job.input_rows.length > config.rows) throw new Error('Invalid job payload');
  const operations = job.input_rows.map((row, index) => ({ updateOne: {
    filter: { _id: hash(`${job.id}:${index}`) }, update: { $setOnInsert: {
      organization_id: job.organization_id, created_by: job.created_by, job_id: job.id, row_number: index + 2,
      row, status: 'pending', certificate_id: null, pdf_path: null, email_status: null, created_at: job.created_at
    } }, upsert: true
  } }));
  await db.collection('bulk_records').bulkWrite(operations, { ordered: false });
  const records = db.collection('bulk_records').find({ job_id: job.id, organization_id: job.organization_id, status: { $in: ['pending', 'failed'] } }).limit(config.rows);
  let cancelled = false;
  for await (const record of records) {
    const current = await owned(db, job, owner);
    if (current.cancel_requested) { cancelled = true; break; }
    try { await processRecord(db, job, record, owner); }
    catch (error) {
      await owned(db, job, owner); // A lost owner cannot mark or count a replacement worker's record.
      await db.collection('bulk_records').updateOne({ _id: record._id, organization_id: job.organization_id }, { $set: { status: 'failed', error: 'Certificate processing failed', processed_at: now() } });
    }
    await db.collection('bulk_jobs').updateOne({ id: job.id, lease_owner: owner }, { $set: await counts(db, job) });
  }
  const summary = await counts(db, job);
  const retry = !cancelled && summary.failed_records > 0 && job.attempts < config.jobAttempts;
  const status = cancelled ? 'cancelled' : retry ? 'queued' : summary.failed_records ? 'completed_with_errors' : 'completed';
  await owned(db, job, owner);
  await db.collection('bulk_jobs').updateOne({ id: job.id, lease_owner: owner }, { $set: {
    ...summary, status, lease_owner: null, lease_until: new Date(0),
    next_attempt_at: new Date(Date.now() + config.pollMs * job.attempts), completed_at: retry ? null : now()
  } });
}
let timer;
async function tick(db) {
  let slot, job, heartbeat;
  try {
    slot = await acquireSlot('bulk-worker', config.jobWorkers, config.leaseMs);
    await db.collection('bulk_jobs').updateMany({ organization_id: { $type: 'string' }, submission_key: { $type: 'string' }, status: 'processing', lease_until: { $lte: new Date() }, attempts: { $gte: config.jobAttempts } }, { $set: { status: 'failed', completed_at: now() } });
    job = await db.collection('bulk_jobs').findOneAndUpdate({
      organization_id: { $type: 'string' }, submission_key: { $type: 'string' }, attempts: { $lt: config.jobAttempts },
      $or: [{ status: 'queued', next_attempt_at: { $lte: new Date() } }, { status: 'processing', lease_until: { $lte: new Date() } }]
    }, { $set: { status: 'processing', lease_owner: slot.token, lease_until: new Date(Date.now() + config.leaseMs), started_at: now() }, $inc: { attempts: 1 } }, { returnDocument: 'after', sort: { created_at: 1 } });
    if (!job) return;
    heartbeat = setInterval(async () => {
      try {
        if (await slot.renew()) await db.collection('bulk_jobs').updateOne({ id: job.id, lease_owner: slot.token, status: 'processing', lease_until: { $gt: new Date() } }, { $set: { lease_until: new Date(Date.now() + config.leaseMs) } });
      } catch { /* Lease expires; ownership checks fence subsequent side effects. */ }
    }, Math.floor(config.leaseMs / 3));
    await processJob(db, job, slot.token);
  } catch (error) {
    if (job && slot) await db.collection('bulk_jobs').updateOne({ id: job.id, lease_owner: slot.token }, { $set: {
      status: job.attempts < config.jobAttempts ? 'queued' : 'failed', lease_owner: null, lease_until: new Date(0),
      next_attempt_at: new Date(Date.now() + config.pollMs * job.attempts), error: 'Job processing interrupted'
    } }).catch(() => {});
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (slot) await slot.release().catch(() => {});
  }
}
function startBulkScheduler(db) {
  if (timer) clearInterval(timer);
  timer = setInterval(() => { tick(db); }, config.pollMs);
  timer.unref();
  tick(db);
}
module.exports = { processJob, startBulkScheduler, tick, sanitizeFileName, terminal };