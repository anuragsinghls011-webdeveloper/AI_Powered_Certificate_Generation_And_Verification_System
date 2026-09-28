/**
 * BullMQ Worker — Event Report Generation & Delivery
 *
 * Replaces the `setInterval`-based event report scheduler with a durable
 * BullMQ queue. Report generation (XLSX/CSV serialization) is CPU-bound
 * and uses worker_threads internally; this BullMQ worker provides the
 * scheduling, retry, and crash-recovery layer on top.
 *
 * Flow:
 *   1. Event is marked completed → API adds job to "event-report" queue
 *   2. This worker picks it up → generates XLSX+CSV → emails admins
 *   3. On failure: BullMQ retries automatically
 *   4. On server crash: job stays in Redis, picked up after restart
 */
const { Worker } = require('bullmq');
const { createRedisConnection } = require('../config/redis');
const { getDB, getEventsCol, getCertificatesCol } = require('../config/db');
const { runReportWorker } = require('../services/eventReportWorker');
const { summarize, reportFilename, MAX_REPORT_ROWS } = require('../services/eventReportService');
const { certificateFilter } = require('../controllers/reportController');
const { eventReportTemplate } = require('../services/emailTemplates');
const { sendEmail } = require('../utils/emailService');

/**
 * Fetch active admin users for an organization.
 */
async function organizationAdmins(db, organizationId) {
  const memberships = await db.collection('organization_memberships').find({
    organization_id: organizationId,
    role: { $in: ['admin', 'super_admin'] },
    status: 'active'
  }, { projection: { _id: 0, user_id: 1, role: 1 } }).toArray();

  const userIds = memberships.map(item => item.user_id);
  if (!userIds.length) return [];

  return db.collection('users').find({
    id: { $in: userIds },
    status: { $ne: 'suspended' },
    email: { $type: 'string', $ne: '' }
  }, { projection: { _id: 0, id: 1, name: 1, email: 1 } }).toArray();
}

/**
 * Main BullMQ job processor for event reports.
 *
 * @param {import('bullmq').Job} bullmqJob
 */
async function processReportJob(bullmqJob) {
  const { eventId, organizationId } = bullmqJob.data;
  const db = getDB();

  // Fetch the event
  const event = await db.collection('events').findOne({
    id: eventId,
    organization_id: organizationId
  });
  if (!event) throw new Error(`Event ${eventId} not found`);

  // Mark as processing
  await db.collection('events').updateOne(
    { _id: event._id },
    {
      $set: {
        'report_delivery.status': 'processing',
        'report_delivery.started_at': new Date().toISOString(),
        'report_delivery.bullmq_job_id': bullmqJob.id
      },
      $inc: { 'report_delivery.attempts': 1 }
    }
  );

  await bullmqJob.updateProgress(10);

  // Fetch certificates
  const certificates = await getCertificatesCol()
    .find(certificateFilter(event), {
      projection: {
        _id: 0, cert_id: 1, recipient_name: 1, recipient_email: 1,
        issue_date: 1, status: 1, metadata: 1, role: 1, grade: 1
      }
    })
    .sort({ cert_id: 1 })
    .limit(MAX_REPORT_ROWS + 1)
    .toArray();

  if (certificates.length > MAX_REPORT_ROWS) {
    throw new Error(`Event exceeds the ${MAX_REPORT_ROWS}-certificate email report limit`);
  }

  await bullmqJob.updateProgress(30);

  // Build clean event data for the report worker
  const cleanEvent = {
    id: String(event.id || event._id),
    title: String(event.title || event.name || 'Untitled event'),
    date: event.date instanceof Date ? event.date.toISOString() : String(event.date || '')
  };

  // Generate both report formats in parallel (uses worker_threads internally)
  const [xlsx, csv] = await Promise.all([
    runReportWorker({ event: cleanEvent, certificates, format: 'xlsx' }),
    runReportWorker({ event: cleanEvent, certificates, format: 'csv' })
  ]);

  await bullmqJob.updateProgress(70);

  // Get admin recipients
  const admins = await organizationAdmins(db, event.organization_id);
  if (!admins.length) throw new Error('No active organization admin email addresses were found');

  // Send emails to all admins
  const summary = summarize(certificates);
  const recipients = [];

  for (const admin of admins) {
    const content = eventReportTemplate({
      adminName: admin.name,
      eventTitle: cleanEvent.title,
      summary,
      completedAt: event.completed_at
    });

    const result = await sendEmail({
      to: admin.email,
      ...content,
      attachments: [
        { filename: reportFilename(cleanEvent.title, 'xlsx'), content: Buffer.from(xlsx) },
        { filename: reportFilename(cleanEvent.title, 'csv'), content: Buffer.from(csv) }
      ],
      idempotencyKey: `event-report/${cleanEvent.id}/${admin.id}/delivery-v1`
    });

    recipients.push({
      user_id: admin.id,
      intended_email: admin.email,
      actual_email: result.actual_recipients?.[0] || null,
      status: result.delivered ? 'sent' : 'failed',
      email_id: result.email_id || null,
      error: result.delivered ? null : result.error
    });
  }

  await bullmqJob.updateProgress(95);

  // Update event with delivery results
  const failed = recipients.filter(item => item.status === 'failed');
  await getEventsCol().updateOne({ _id: event._id }, {
    $set: {
      'report_delivery.status': failed.length ? 'failed' : 'sent',
      'report_delivery.completed_at': new Date().toISOString(),
      'report_delivery.recipients': recipients,
      'report_delivery.error': failed.length ? `${failed.length} admin delivery attempt(s) failed` : null
    }
  });

  // Audit log
  await db.collection('audit_logs').insertOne({
    action: failed.length ? 'EVENT_REPORT_EMAIL_FAILED' : 'EVENT_REPORT_EMAIL_SENT',
    event_id: cleanEvent.id,
    organization_id: event.organization_id,
    recipient_count: recipients.length,
    timestamp: new Date().toISOString()
  });

  await bullmqJob.updateProgress(100);

  if (failed.length) {
    throw new Error(`${failed.length} of ${recipients.length} admin email(s) failed`);
  }

  return { status: 'sent', recipientCount: recipients.length };
}

/** @type {Worker | null} */
let worker = null;

/**
 * Start the BullMQ event report worker.
 *
 * @param {object} [opts] - Override worker options
 * @returns {Worker}
 */
function startReportWorker(opts = {}) {
  if (worker) return worker;

  const connection = createRedisConnection();

  worker = new Worker(
    'event-report',
    processReportJob,
    {
      connection,
      concurrency: 2,         // Max 2 concurrent report generations
      lockDuration: 120000,    // 2 min lock (reports can be heavy)
      stalledInterval: 60000,
      maxStalledCount: 1,
      ...opts
    }
  );

  worker.on('completed', (job, result) => {
    console.log(`[ReportWorker] Report for event ${job.data.eventId} delivered to ${result?.recipientCount} admin(s)`);
  });

  worker.on('failed', async (job, error) => {
    console.error(`[ReportWorker] Report failed for event ${job?.data?.eventId}:`, error.message);

    // Update event status on final failure
    if (job && job.attemptsMade >= job.opts.attempts) {
      try {
        const db = getDB();
        await db.collection('events').updateOne(
          { id: job.data.eventId, organization_id: job.data.organizationId },
          {
            $set: {
              'report_delivery.status': 'failed',
              'report_delivery.error': error.message || 'Report generation failed',
              'report_delivery.completed_at': new Date().toISOString()
            }
          }
        );
      } catch (dbError) {
        console.error(`[ReportWorker] Failed to update event:`, dbError.message);
      }
    }
  });

  worker.on('error', (error) => {
    console.error('[ReportWorker] Worker error:', error.message);
  });

  console.log('[ReportWorker] Started with concurrency=2');
  return worker;
}

/**
 * Recovery: re-queue any events that were left in 'processing' state
 * (e.g. from a previous crash before BullMQ was in place).
 */
async function recoverStaleReports() {
  const db = getDB();
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const staleEvents = await db.collection('events').find({
    status: 'completed',
    'report_delivery.status': { $in: ['queued', 'processing'] },
    $or: [
      { 'report_delivery.started_at': { $lt: staleBefore } },
      { 'report_delivery.started_at': { $exists: false } }
    ]
  }).toArray();

  const { addReportJob } = require('./index');
  for (const event of staleEvents) {
    try {
      await addReportJob({
        eventId: String(event.id || event._id),
        organizationId: event.organization_id
      });
      console.log(`[ReportWorker] Recovered stale report for event ${event.id || event._id}`);
    } catch (err) {
      if (!err.message?.includes('Duplicate')) {
        console.error(`[ReportWorker] Failed to recover event ${event.id}:`, err.message);
      }
    }
  }

  return staleEvents.length;
}

/**
 * Gracefully stop the report worker.
 */
async function stopReportWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    console.log('[ReportWorker] Stopped');
  }
}

module.exports = {
  startReportWorker,
  stopReportWorker,
  recoverStaleReports,
  processReportJob
};
