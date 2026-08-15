// In-process bulk generation worker.
// Persists job & record state to MongoDB; runs limited-concurrency PDF generation.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pLimit = require('p-limit');
const QRCode = require('qrcode');
const { renderCertificatePdfBuffer } = require('./certificateRenderer');
const { invertMapping } = require('./validationEngine');

const CERT_DIR = process.env.CERT_STORAGE_DIR || '/app/backend/storage/certificates';

const cancelFlags = new Map(); // jobId -> true when cancellation requested
const runningJobs = new Set();

function sanitizeFileName(name) {
  return String(name || 'certificate')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'certificate';
}

function fmtIdSeq(seq) {
  return String(seq).padStart(6, '0');
}

function nowIso() { return new Date().toISOString(); }

async function generateCertIdSequence(db) {
  const counters = db.collection('counters');
  const year = new Date().getFullYear();
  const key = `cert_${year}`;
  const doc = await counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = (doc && (doc.value?.seq ?? doc.seq)) || 1;
  return `CERT-${year}-${fmtIdSeq(seq)}`;
}

function buildValuesForRow(rowRecord, mapping, defaults, template, cert) {
  const inv = invertMapping(mapping);
  const row = rowRecord.row || {};
  const pick = (fieldType) => {
    const header = inv[fieldType];
    if (header && row[header] != null && String(row[header]).trim() !== '') return String(row[header]).trim();
    if (defaults && defaults[fieldType]) return String(defaults[fieldType]);
    return '';
  };
  return {
    recipient_name: pick('recipient_name'),
    email: pick('email'),
    event_title: pick('event_title'),
    issue_date: pick('issue_date') || cert.issue_date,
    organization_name: pick('organization_name'),
    rank: pick('rank') || 'Participant',
    score: pick('score'),
    certificate_id: cert.certificate_id,
    verification_url: cert.verification_url,
    issuer_name: template?.issuer_name || 'Authorised Signatory',
    issuer_title: template?.issuer_title || ''
  };
}

async function processJob(db, jobId, verifyBaseUrl) {
  if (runningJobs.has(jobId)) return;
  runningJobs.add(jobId);
  const jobsCol = db.collection('bulk_jobs');
  const recCol = db.collection('bulk_records');
  const certsCol = db.collection('certificates');
  const templatesCol = db.collection('templates');

  const job = await jobsCol.findOne({ id: jobId });
  if (!job) { runningJobs.delete(jobId); return; }
  const template = await templatesCol.findOne({ id: job.template_id });

  await jobsCol.updateOne({ id: jobId }, { $set: { status: 'processing', started_at: job.started_at || nowIso() } });

  const jobDir = path.join(CERT_DIR, jobId);
  fs.mkdirSync(jobDir, { recursive: true });

  const limit = pLimit(3);
  const settings = job.settings || {};
  const filenamePattern = settings.filename_pattern || '{{recipient_name}}_{{certificate_id}}.pdf';

  // Pull pending (or failed if this is a retry) records
  const pending = await recCol.find({ job_id: jobId, status: { $in: ['pending', 'failed'] } }).toArray();

  const tasks = pending.map((rec) => limit(async () => {
    if (cancelFlags.get(jobId)) return;

    try {
      // Assign certificate identity if not already
      let certId = rec.certificate_id;
      if (!certId) certId = await generateCertIdSequence(db);
      const verificationUrl = `${verifyBaseUrl}/verify/${certId}`;

      const values = buildValuesForRow(rec, job.mapping, job.defaults, template, {
        certificate_id: certId,
        verification_url: verificationUrl,
        issue_date: job.defaults?.issue_date || new Date().toISOString().split('T')[0]
      });

      if (!values.recipient_name) throw new Error('recipient_name is empty');

      const pdfBuffer = await renderCertificatePdfBuffer(template, values);
      const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

      const fileName = sanitizeFileName(
        filenamePattern
          .replace('{{recipient_name}}', values.recipient_name)
          .replace('{{certificate_id}}', values.certificate_id)
      );
      const finalName = fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`;
      const filePath = path.join(jobDir, finalName);
      fs.writeFileSync(filePath, pdfBuffer);

      // QR base64 for repository / verify UI
      const qrDataUrl = await QRCode.toDataURL(verificationUrl);
      const qrB64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');

      const certDoc = {
        cert_id: certId,
        event_id: job.event_id || null,
        event_title: values.event_title || 'Bulk Event',
        event_category: 'Bulk',
        template_id: job.template_id,
        recipient_name: values.recipient_name,
        recipient_email: values.email,
        role: values.rank || 'Participant',
        grade: values.score || 'Completed Successfully',
        issue_date: values.issue_date,
        issuer_name: values.issuer_name,
        issuer_title: values.issuer_title,
        verification_url: verificationUrl,
        qr_code_b64: qrB64,
        pdf_hash: hash,
        pdf_path: filePath,
        bulk_job_id: jobId,
        status: 'Active',
        sent_email: false,
        email_status: values.email ? 'queued' : 'skipped',
        created_at: nowIso()
      };
      await certsCol.insertOne(certDoc);

      // "Send" email (mock — mark as sent)
      let emailStatus = 'skipped';
      if (settings.email_enabled !== false && values.email) {
        emailStatus = 'sent';
        await certsCol.updateOne({ cert_id: certId }, { $set: { sent_email: true, email_status: 'sent' } });
      }

      await recCol.updateOne({ _id: rec._id }, {
        $set: {
          status: 'success',
          certificate_id: certId,
          pdf_path: filePath,
          pdf_hash: hash,
          email_status: emailStatus,
          error: null,
          processed_at: nowIso()
        }
      });

      await jobsCol.updateOne({ id: jobId }, {
        $inc: { processed_records: 1, successful_records: 1 }
      });
    } catch (err) {
      await recCol.updateOne({ _id: rec._id }, {
        $set: {
          status: 'failed',
          error: (err && err.message) || 'unknown error',
          processed_at: nowIso()
        }
      });
      await jobsCol.updateOne({ id: jobId }, {
        $inc: { processed_records: 1, failed_records: 1 }
      });
    }
  }));

  await Promise.all(tasks);

  // Finalise job status
  const fresh = await jobsCol.findOne({ id: jobId });
  let finalStatus;
  if (cancelFlags.get(jobId)) finalStatus = 'cancelled';
  else if (fresh.failed_records > 0 && fresh.successful_records > 0) finalStatus = 'completed_with_errors';
  else if (fresh.failed_records > 0 && fresh.successful_records === 0) finalStatus = 'failed';
  else finalStatus = 'completed';

  await jobsCol.updateOne({ id: jobId }, { $set: { status: finalStatus, completed_at: nowIso() } });
  cancelFlags.delete(jobId);
  runningJobs.delete(jobId);
}

function requestCancel(jobId) { cancelFlags.set(jobId, true); }

module.exports = { processJob, requestCancel, sanitizeFileName };
