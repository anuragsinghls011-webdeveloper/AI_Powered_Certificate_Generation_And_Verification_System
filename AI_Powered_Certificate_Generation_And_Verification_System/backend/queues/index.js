/**
 * BullMQ Queue definitions for the certificate management system.
 *
 * Three dedicated queues, each handling a distinct workload:
 *
 *   1. certificate-generation — Bulk PDF generation + DB writes
 *   2. email-delivery         — Individual certificate email sends
 *   3. event-report           — Event report generation + admin email
 *
 * All queues share the same Redis connection (producer side) and write
 * to MongoDB for persistent record-keeping. Redis is the scheduling layer;
 * MongoDB remains the source of truth.
 */
const { Queue } = require('bullmq');
const { getSharedConnection } = require('../config/redis');

/** @type {Queue | null} */
let certificateQueue = null;
/** @type {Queue | null} */
let emailQueue = null;
/** @type {Queue | null} */
let reportQueue = null;

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 7 * 24 * 3600, count: 5000 },  // Keep last 5000 or 7 days
  removeOnFail: { age: 30 * 24 * 3600, count: 10000 }       // Keep failures 30 days
};

function getQueues() {
  const connection = getSharedConnection();

  if (!certificateQueue) {
    certificateQueue = new Queue('certificate-generation', {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: Number(process.env.JOB_MAX_ATTEMPTS) || 3,
        backoff: { type: 'exponential', delay: Number(process.env.JOB_POLL_MS) || 2000 }
      }
    });
  }

  if (!emailQueue) {
    emailQueue = new Queue('email-delivery', {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 5,
        backoff: { type: 'exponential', delay: 3000 }
      }
    });
  }

  if (!reportQueue) {
    reportQueue = new Queue('event-report', {
      connection,
      defaultJobOptions: {
        ...defaultJobOptions,
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 }
      }
    });
  }

  return { certificateQueue, emailQueue, reportQueue };
}

/**
 * Add a bulk certificate generation job to the queue.
 *
 * @param {object} jobData - Must include jobId, organizationId, etc.
 * @param {object} [opts]  - Optional BullMQ job options overrides
 * @returns {Promise<import('bullmq').Job>}
 */
async function addCertificateJob(jobData, opts = {}) {
  const { certificateQueue } = getQueues();

  // Remove any previous BullMQ job for this MongoDB jobId so retries/recovery
  // are never silently dropped by BullMQ's duplicate-ID guard.
  try {
    const oldJob = await certificateQueue.getJob(jobData.jobId);
    if (oldJob) {
      const state = await oldJob.getState();
      if (['completed', 'failed'].includes(state)) {
        await oldJob.remove();
      }
    }
  } catch (_) { /* ignore — job may not exist */ }

  return certificateQueue.add('generate', jobData, {
    jobId: jobData.jobId,
    priority: jobData.priority || 0,
    ...opts
  });
}

/**
 * Add an individual email delivery job.
 *
 * @param {object} emailData - { certId, organizationId, recordId, jobId }
 * @param {object} [opts]
 * @returns {Promise<import('bullmq').Job>}
 */
async function addEmailJob(emailData, opts = {}) {
  const { emailQueue } = getQueues();
  return emailQueue.add('deliver', emailData, {
    jobId: `email-${emailData.certId}-${Date.now()}`,
    ...opts
  });
}

/**
 * Add an event report generation + delivery job.
 *
 * @param {object} reportData - { eventId, organizationId }
 * @param {object} [opts]
 * @returns {Promise<import('bullmq').Job>}
 */
async function addReportJob(reportData, opts = {}) {
  const { reportQueue } = getQueues();
  return reportQueue.add('process-report', reportData, {
    jobId: `report-${reportData.eventId}`,
    ...opts
  });
}

/**
 * Graceful close of all queues.
 */
async function closeQueues() {
  const closers = [certificateQueue, emailQueue, reportQueue]
    .filter(Boolean)
    .map(q => q.close().catch(() => {}));
  await Promise.all(closers);
  certificateQueue = emailQueue = reportQueue = null;
}

module.exports = {
  getQueues,
  addCertificateJob,
  addEmailJob,
  addReportJob,
  closeQueues
};
