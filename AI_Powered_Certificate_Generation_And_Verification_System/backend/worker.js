require('dotenv').config();
const { connectDB } = require('./config/db');
const { startCertificateWorker, startEmailWorker, startReportWorker, recoverStaleReports } = require('./queues');
const { startBulkScheduler } = require('./modules/bulkGeneration/jobQueue');
const { redisHealthCheck } = require('./config/redis');

async function startWorker() {
  try {
    const db = await connectDB();
    console.log('[Worker] Connected to MongoDB successfully');

    // --- Crash Recovery: Clean up stale state from previous run ---
    await db.collection('work_slots').updateMany({}, { $set: { until: new Date(0) } });
    const stuckReset = await db.collection('bulk_jobs').updateMany(
      { status: 'processing' },
      { $set: { status: 'queued', attempts: 0, lease_owner: null, lease_until: new Date(0), next_attempt_at: new Date() } }
    );
    if (stuckReset.modifiedCount > 0) {
      console.log(`[Worker] Reset ${stuckReset.modifiedCount} stuck processing job(s) to queued`);
    }

    const redisAvailable = await redisHealthCheck();

    if (redisAvailable) {
      console.log('[Worker] Redis available — starting BullMQ workers');
      startCertificateWorker();
      startEmailWorker();
      startReportWorker();

      const recovered = await recoverStaleReports();
      if (recovered > 0) {
        console.log(`[Worker] Recovered ${recovered} stale event report(s)`);
      }
    } else {
      console.warn('[Worker] Redis NOT available — falling back to legacy setInterval schedulers');
      console.warn('[Worker] Set REDIS_URL in .env for durable queue processing');
      startBulkScheduler(db);
    }

    console.log('[Worker] Dedicated Background Worker Process is running');

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('Worker shutting down...');
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    console.error('[Worker] Fatal Error during startup:', error);
    process.exit(1);
  }
}

startWorker();
