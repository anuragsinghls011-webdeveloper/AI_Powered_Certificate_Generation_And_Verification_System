const crypto = require('crypto');
const { getDB } = require('../config/db');
const limits = require('../config/security');
const { issuanceResources } = require('../utils/tenant');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function admit(db, org, jobId) {
  const slots = db.collection('job_admissions');
  if (await slots.findOne({ job_id: jobId })) return;
  for (let n = 0; n < limits.queueLimit; n++) {
    const _id = `${org}:${n}`;
    const current = await slots.findOne({ _id });
    if (current?.job_id) {
      const job = await db.collection('bulk_jobs').findOne({ id: current.job_id }, { projection: { status: 1 } });
      if (job && !['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) continue;
      if (!job && current.expires_at > new Date()) continue;
    }
    try {
      const updated = await slots.findOneAndUpdate(current ? { _id, job_id: current.job_id } : { _id, job_id: { $exists: false } },
        { $set: { job_id: jobId, expires_at: new Date(Date.now() + limits.leaseMs) } }, { upsert: !current, returnDocument: 'after' });
      if (updated) return;
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (await slots.findOne({ job_id: jobId })) return;
    }
  }
  throw Object.assign(new Error('Organization job queue is full'), { statusCode: 429 });
}
async function submitJob(req, { rows, mapping, defaults = {}, settings = {}, source = {}, event_id, template_id, action = 'bulk' }) {
  if (!Array.isArray(rows) || !rows.length || rows.length > limits.rows || Buffer.byteLength(JSON.stringify(rows)) > limits.payloadBytes) throw Object.assign(new Error('Certificate job size limit exceeded'), { statusCode: 413 });
  const { event, template } = await issuanceResources(req, event_id, template_id);
  if (Buffer.byteLength(JSON.stringify({ rows, template, mapping, defaults, settings })) > limits.payloadBytes) throw Object.assign(new Error('Job payload limit exceeded'), { statusCode: 413 });
  const payload = { rows, mapping, defaults, settings, source, event_id, template_id, action };
  const requestHash = digest(canonical(payload));
  const key = req.get('Idempotency-Key');
  if (key !== undefined && (typeof key !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(key))) throw Object.assign(new Error('Invalid idempotency key'), { statusCode: 400 });
  const submissionKey = digest(`${req.organization.id}:${req.user.id}:${action}:${key || requestHash}`);
  const jobId = `BG-${submissionKey}`;
  const db = getDB();
  let existing = await db.collection('bulk_jobs').findOne({ submission_key: submissionKey });
  if (existing) {
    if (existing.request_hash !== requestHash) throw Object.assign(new Error('Idempotency key already used with different content'), { statusCode: 409 });
    return existing;
  }
  await admit(db, req.organization.id, jobId);
  const job = {
    id: jobId, submission_key: submissionKey, request_hash: requestHash,
    organization_id: req.organization.id, created_by: req.user.id,
    event_id, template_id, event_snapshot: { title: event.title, category: event.category }, template_snapshot: template,
    source_upload_id: source.upload_id || null, source_file_name: source.name || 'Direct issuance',
    mapping, defaults, settings, input_rows: rows, action,
    status: 'queued', total_records: rows.length, processed_records: 0, successful_records: 0, failed_records: 0,
    attempts: 0, lease_owner: null, lease_until: new Date(0), cancel_requested: false,
    next_attempt_at: new Date(), created_at: new Date().toISOString(), started_at: null, completed_at: null
  };
  try { await db.collection('bulk_jobs').insertOne({ ...job }); }
  catch (error) {
    if (error.code !== 11000) throw error;
    existing = await db.collection('bulk_jobs').findOne({ submission_key: submissionKey });
    if (!existing || existing.request_hash !== requestHash) throw Object.assign(new Error('Conflicting submission'), { statusCode: 409 });
    return existing;
  }
  await db.collection('audit_logs').updateOne({ _id: `job-start:${jobId}` }, { $setOnInsert: { action: 'BULK_GENERATION_STARTED', organization_id: job.organization_id, user_id: job.created_by, job_id: job.id, total_records: rows.length, timestamp: job.created_at } }, { upsert: true });
  return job;
}
async function initializeJobIndexes(db) {
  await db.collection('work_rates').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('job_admissions').createIndex({ job_id: 1 }, { unique: true, partialFilterExpression: { job_id: { $type: 'string' } } });
  await db.collection('bulk_jobs').createIndex({ submission_key: 1 }, { unique: true, partialFilterExpression: { submission_key: { $type: 'string' } } });
  await db.collection('bulk_jobs').createIndex({ organization_id: 1, status: 1, next_attempt_at: 1, lease_until: 1 });
  await db.collection('bulk_records').createIndex({ organization_id: 1, job_id: 1, status: 1 });
  await db.collection('certificates').createIndex({ issuance_key: 1 }, { unique: true, partialFilterExpression: { issuance_key: { $type: 'string' } } });
}
const publicJob = job => {
  const { _id, input_rows, template_snapshot, event_snapshot, submission_key, request_hash, lease_owner, ...safe } = job;
  return safe;
};
module.exports = { submitJob, initializeJobIndexes, publicJob, admit };