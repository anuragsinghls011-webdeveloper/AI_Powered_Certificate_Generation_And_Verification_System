require('dotenv').config();
const { app, mountBulkRoutes } = require('./app');
const { connectDB } = require('./config/db');
const { seedInitialData } = require('./services/seedService');
const { initializeJobIndexes } = require('./services/jobSubmission');
const { initializeAuthIndexes } = require('./services/authIndexes');

// BullMQ imports
const { redisHealthCheck, closeRedis } = require('./config/redis');
const { closeQueues } = require('./queues');
const { startCertificateWorker, stopCertificateWorker } = require('./queues/certificateWorker');
const { startEmailWorker, stopEmailWorker } = require('./queues/emailWorker');
const { startReportWorker, stopReportWorker, recoverStaleReports } = require('./queues/reportWorker');

// Legacy schedulers (kept as fallback if Redis is unavailable)
const { startEventReportScheduler } = require('./services/eventReportScheduler');
const { startBulkScheduler } = require('./modules/bulkGeneration/jobQueue');

const PORT = process.env.PORT || 8001;

async function start() {
  try {
    const db = await connectDB();
    await initializeAuthIndexes(db);
    await initializeJobIndexes(db);

    // Mount bulk generation routes (requires db instance)
    mountBulkRoutes(db);

    // Seed default data on first run
    await seedInitialData();

    // --- Queue System Initialization ---
    let redisAvailable = false;
    if (process.env.DISABLE_WORKERS === 'true') {
      console.log('[Server] Background workers disabled via DISABLE_WORKERS=true (Running as API-only)');
    } else {
      redisAvailable = await redisHealthCheck();
  
      if (redisAvailable) {
        console.log('[Server] Redis available — starting BullMQ workers');
  
        // Start all BullMQ workers
        startCertificateWorker();
        startEmailWorker();
        startReportWorker();
  
        // Recover any jobs that were stuck from before (crash recovery)
        const recovered = await recoverStaleReports();
        if (recovered > 0) {
          console.log(`[Server] Recovered ${recovered} stale event report(s)`);
        }
  
        // Recover stale bulk jobs too
        await recoverStaleBulkJobs(db);
      } else {
        console.warn('[Server] Redis NOT available — falling back to legacy setInterval schedulers');
        console.warn('[Server] Set REDIS_URL in .env for durable queue processing');
        await startEventReportScheduler(db);
        startBulkScheduler(db);
      }
    }

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Node.js Express backend server running on port ${PORT}`);
      if (redisAvailable) {
        console.log('[Server] Queue system: BullMQ (Redis-backed, durable)');
      } else {
        console.log('[Server] Queue system: Legacy (in-process, non-durable)');
      }
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

/** Re-enqueue MongoDB jobs not yet handed to BullMQ. BullMQ owns active jobs. */
async function recoverStaleBulkJobs(db) {
  const { addCertificateJob } = require('./queues');
  const config = require('./config/security');

  // A processing job may belong to a healthy worker in another API instance.
  const staleJobs = await db.collection('bulk_jobs').find({
    status: 'queued',
    attempts: { $lt: config.jobAttempts },
    $or: [{ next_attempt_at: { $lte: new Date() } }, { next_attempt_at: { $exists: false } }]
  }).toArray();

  let recovered = 0;
  for (const job of staleJobs) {
    try {
      await addCertificateJob({
        jobId: job.id,
        organizationId: job.organization_id,
        createdBy: job.created_by
      });
      recovered++;
      console.log(`[Server] Recovered stale bulk job: ${job.id}`);
    } catch (err) {
      console.error(`[Server] Failed to recover job ${job.id}:`, err.message);
    }
  }

  if (recovered > 0) {
    console.log(`[Server] Recovered ${recovered} stale bulk job(s)`);
  }
}

// --- Graceful Shutdown ---
async function gracefulShutdown(signal) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);

  try {
    // Stop accepting new jobs
    await stopCertificateWorker();
    await stopEmailWorker();
    await stopReportWorker();

    // Close queue connections
    await closeQueues();

    // Close Redis
    await closeRedis();

    console.log('[Server] All workers and connections closed');
  } catch (err) {
    console.error('[Server] Error during shutdown:', err.message);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();
