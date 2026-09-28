/**
 * BullMQ Worker — Certificate Generation
 *
 * This worker picks up jobs from the "certificate-generation" queue and
 * processes them using the EXISTING `processJob` / `processRecord` logic
 * from `modules/bulkGeneration/jobQueue.js`.
 *
 * Key design decisions:
 *   - The worker reuses ALL existing MongoDB record/certificate logic.
 *   - Redis is ONLY the scheduling layer; MongoDB stays the source of truth.
 *   - Progress is reported via BullMQ's `job.updateProgress()` AND MongoDB.
 *   - Cancellation is checked both via BullMQ and MongoDB's `cancel_requested`.
 *   - Each worker creates its OWN Redis connection (BullMQ requirement).
 */
const { Worker } = require('bullmq');
const crypto = require('crypto');
const path = require('path');
const QRCode = require('qrcode');
const { createRedisConnection } = require('../config/redis');
const { getDB } = require('../config/db');
const config = require('../config/security');
const { renderCertificatePdfBuffer } = require('../modules/bulkGeneration/certificateRenderer');
const { invertMapping } = require('../modules/bulkGeneration/validationEngine');
const { deliverCertificate } = require('../services/certificateEmailService');
const storageService = require('../services/storageService');
const { addEmailJob } = require('./index');

const now = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

function sanitizeFileName(name) {
  return String(name || 'certificate').replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'certificate';
}

async function nextCertificateId(db) {
  const year = new Date().getFullYear();
  const counter = await db.collection('counters').findOneAndUpdate(
    { _id: `cert_${year}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return `CERT-${year}-${String(counter.seq).padStart(6, '0')}`;
}

function valuesFor(job, record, certId) {
  const inv = invertMapping(job.mapping);
  const pick = field => String(record.row[inv[field]] ?? job.defaults[field] ?? '').trim();
  return {
    recipient_name: pick('recipient_name'),
    email: pick('email'),
    event_title: job.event_snapshot.title,
    event_category: job.event_snapshot.category,
    issue_date: pick('issue_date') || job.created_at.slice(0, 10),
    organization_name: pick('organization_name'),
    rank: pick('rank') || 'Participant',
    score: pick('score'),
    certificate_id: certId,
    verification_url: `${process.env.APP_URL}/verify/${certId}`,
    issuer_name: job.template_snapshot.issuer_name,
    issuer_title: job.template_snapshot.issuer_title
  };
}

/**
 * Process a single certificate record.
 * Generates PDF, uploads, writes certificate to DB, optionally queues email.
 */
async function processRecord(db, jobDoc, record) {
  let certId = record.certificate_id;
  if (!certId) {
    const candidate = await nextCertificateId(db);
    const stored = await db.collection('bulk_records').findOneAndUpdate(
      { _id: record._id, organization_id: jobDoc.organization_id, certificate_id: null },
      { $set: { certificate_id: candidate } },
      { returnDocument: 'after' }
    );
    certId = stored?.certificate_id || (await db.collection('bulk_records').findOne({ _id: record._id })).certificate_id;
  }

  const values = valuesFor(jobDoc, record, certId);
  if (!values.recipient_name) throw new Error('Recipient name is required');

  const directory = path.join(config.certDir, jobDoc.id);
  const fileName = `${record._id}.pdf`;

  // Check if PDF already exists (idempotent)
  const pdfCheck = await storageService.checkPdfExists(directory, fileName);
  let filePath = pdfCheck.path;
  let pdf = null;

  if (pdfCheck.exists) {
    pdf = await storageService.getPdfBuffer(filePath);
  } else {
    pdf = await renderCertificatePdfBuffer(jobDoc.template_snapshot, values, { direct: true });
    filePath = await storageService.uploadPdf(directory, fileName, pdf);
  }

  const qr = await QRCode.toDataURL(values.verification_url);
  const certificate = {
    issuance_key: record._id,
    organization_id: jobDoc.organization_id,
    created_by: jobDoc.created_by,
    cert_id: certId,
    event_id: jobDoc.event_id,
    event_title: values.event_title,
    event_category: values.event_category,
    template_id: jobDoc.template_id,
    recipient_name: values.recipient_name,
    recipient_email: values.email,
    role: values.rank,
    grade: values.score || 'Completed Successfully',
    issue_date: values.issue_date,
    issuer_name: values.issuer_name,
    issuer_title: values.issuer_title,
    verification_url: values.verification_url,
    qr_code_b64: qr.replace(/^data:image\/png;base64,/, ''),
    status: 'Active',
    pdf_hash: hash(pdf),
    pdf_path: filePath,
    bulk_job_id: jobDoc.id,
    sent_email: false,
    email_status: jobDoc.settings.email_enabled !== false && values.email ? 'queued' : 'skipped',
    created_at: jobDoc.created_at
  };

  try {
    await db.collection('certificates').updateOne(
      { issuance_key: record._id },
      { $setOnInsert: certificate },
      { upsert: true }
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
  }

  const stored = await db.collection('certificates').findOne({
    issuance_key: record._id,
    organization_id: jobDoc.organization_id
  });

  let emailStatus = stored.email_status;

  // Queue email delivery as a separate BullMQ job instead of inline send
  if (jobDoc.settings.email_enabled !== false && values.email && emailStatus !== 'sent') {
    try {
      await addEmailJob({
        certId: certId,
        organizationId: jobDoc.organization_id,
        recordId: record._id,
        jobId: jobDoc.id,
        templateSnapshot: jobDoc.template_snapshot,
        pdfPath: filePath
      });
      emailStatus = 'queued';
    } catch (emailError) {
      console.error(`[CertWorker] Failed to queue email for ${certId}:`, emailError.message);
      emailStatus = 'failed';
    }
  }

  await db.collection('bulk_records').updateOne(
    { _id: record._id, organization_id: jobDoc.organization_id },
    {
      $set: {
        status: 'success',
        certificate_id: certId,
        pdf_path: filePath,
        pdf_hash: hash(pdf),
        email_status: emailStatus,
        error: null,
        processed_at: now()
      }
    }
  );
}

/**
 * Get current success/fail counts for a job.
 */
async function counts(db, jobDoc) {
  const q = { job_id: jobDoc.id, organization_id: jobDoc.organization_id };
  const [successful, failed] = await Promise.all([
    db.collection('bulk_records').countDocuments({ ...q, status: 'success' }),
    db.collection('bulk_records').countDocuments({ ...q, status: 'failed' })
  ]);
  return { successful_records: successful, failed_records: failed, processed_records: successful + failed };
}

/**
 * Main BullMQ job processor.
 *
 * @param {import('bullmq').Job} bullmqJob
 */
async function processCertificateJob(bullmqJob) {
  const { jobId } = bullmqJob.data;
  const db = getDB();

  // Fetch the MongoDB job document
  const jobDoc = await db.collection('bulk_jobs').findOne({ id: jobId });
  if (!jobDoc) throw new Error(`Job ${jobId} not found in MongoDB`);

  // Mark as processing
  await db.collection('bulk_jobs').updateOne(
    { id: jobId },
    {
      $set: {
        status: 'processing',
        started_at: now(),
        bullmq_job_id: bullmqJob.id
      },
      $inc: { attempts: 1 }
    }
  );

  // Validate input rows
  if (!Array.isArray(jobDoc.input_rows) || jobDoc.input_rows.length > config.rows) {
    throw new Error('Invalid job payload');
  }

  // Upsert all records (idempotent via stable row keys)
  const operations = jobDoc.input_rows.map((row, index) => ({
    updateOne: {
      filter: { _id: hash(`${jobDoc.id}:${index}`) },
      update: {
        $setOnInsert: {
          organization_id: jobDoc.organization_id,
          created_by: jobDoc.created_by,
          job_id: jobDoc.id,
          row_number: index + 2,
          row,
          status: 'pending',
          certificate_id: null,
          pdf_path: null,
          email_status: null,
          created_at: jobDoc.created_at
        }
      },
      upsert: true
    }
  }));
  await db.collection('bulk_records').bulkWrite(operations, { ordered: false });

  // Fetch all pending/failed records to process
  const allRecords = await db.collection('bulk_records')
    .find({
      job_id: jobDoc.id,
      organization_id: jobDoc.organization_id,
      status: { $in: ['pending', 'failed'] }
    })
    .limit(config.rows)
    .toArray();

  let cancelled = false;
  const CHUNK_SIZE = 3;
  const totalRecords = allRecords.length;

  for (let i = 0; i < allRecords.length; i += CHUNK_SIZE) {
    // Check cancellation from MongoDB
    const current = await db.collection('bulk_jobs').findOne({ id: jobId });
    if (current?.cancel_requested) {
      cancelled = true;
      break;
    }

    // Check if BullMQ job itself was cancelled
    if (await bullmqJob.isFailed()) {
      cancelled = true;
      break;
    }

    const chunk = allRecords.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (record) => {
      try {
        await processRecord(db, jobDoc, record);
      } catch (error) {
        await db.collection('bulk_records').updateOne(
          { _id: record._id, organization_id: jobDoc.organization_id },
          {
            $set: {
              status: 'failed',
              error: error.message || 'Certificate processing failed',
              processed_at: now()
            }
          }
        );
      }
    }));

    // Update progress in both BullMQ and MongoDB
    const progress = Math.round(((i + chunk.length) / totalRecords) * 100);
    await bullmqJob.updateProgress(progress);
    await db.collection('bulk_jobs').updateOne(
      { id: jobId },
      { $set: await counts(db, jobDoc) }
    );
  }

  // Final status
  const summary = await counts(db, jobDoc);
  const status = cancelled
    ? 'cancelled'
    : summary.failed_records > 0
      ? 'completed_with_errors'
      : 'completed';

  await db.collection('bulk_jobs').updateOne(
    { id: jobId },
    {
      $set: {
        ...summary,
        status,
        completed_at: cancelled ? null : now(),
        bullmq_completed: true
      }
    }
  );

  return { status, ...summary };
}

/** @type {Worker | null} */
let worker = null;

/**
 * Start the BullMQ certificate generation worker.
 *
 * @param {object} [opts] - Override worker options
 * @returns {Worker}
 */
function startCertificateWorker(opts = {}) {
  if (worker) return worker;

  const connection = createRedisConnection();

  worker = new Worker(
    'certificate-generation',
    processCertificateJob,
    {
      connection,
      concurrency: Number(process.env.JOB_WORKERS) || 4,
      lockDuration: Number(process.env.JOB_LEASE_MS) || 90000,
      stalledInterval: 30000,
      maxStalledCount: 2,
      ...opts
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[CertWorker] Job ${job.data.jobId} completed:`, result?.status);
  });

  worker.on('failed', async (job, error) => {
    console.error(`[CertWorker] Job ${job?.data?.jobId} failed:`, error.message);

    // Always update MongoDB status on BullMQ failure so jobs don't stay stuck in 'processing'
    if (job) {
      try {
        const db = getDB();
        const mongoJob = await db.collection('bulk_jobs').findOne({ id: job.data.jobId });
        // Only update if the job is still in a non-terminal state
        if (mongoJob && !['completed', 'completed_with_errors', 'cancelled'].includes(mongoJob.status)) {
          const isFinalAttempt = job.attemptsMade >= (job.opts.attempts || 3);
          await db.collection('bulk_jobs').updateOne(
            { id: job.data.jobId },
            {
              $set: {
                status: isFinalAttempt ? 'failed' : 'queued',
                error: error.message || 'Job processing failed',
                ...(isFinalAttempt ? { completed_at: now() } : { next_attempt_at: new Date() })
              }
            }
          );
        }
      } catch (dbError) {
        console.error(`[CertWorker] Failed to update MongoDB for ${job.data.jobId}:`, dbError.message);
      }
    }
  });

  worker.on('progress', (job, progress) => {
    console.log(`[CertWorker] Job ${job.data.jobId} progress: ${progress}%`);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[CertWorker] Job ${jobId} stalled — will be retried`);
  });

  worker.on('error', (error) => {
    console.error('[CertWorker] Worker error:', error.message);
  });

  console.log(`[CertWorker] Started with concurrency=${worker.opts.concurrency}`);
  return worker;
}

/**
 * Gracefully stop the worker.
 */
async function stopCertificateWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[CertWorker] Stopped');
  }
}

module.exports = { startCertificateWorker, stopCertificateWorker, processCertificateJob };
