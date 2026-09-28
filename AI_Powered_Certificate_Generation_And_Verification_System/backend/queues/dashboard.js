/**
 * BullMQ Queue Dashboard API
 *
 * Provides a monitoring/admin API for all BullMQ queues.
 * This lets the frontend (or an admin tool) see:
 *   - Queue health (active, waiting, completed, failed counts)
 *   - Individual job status
 *   - Retry/remove failed jobs
 *
 * Mounted at: /api/admin/queues (behind admin auth)
 */
const express = require('express');
const { getQueues } = require('./index');

function buildDashboardRouter() {
  const router = express.Router();

  /**
   * GET /api/admin/queues/health
   * Overview of all queue states.
   */
  router.get('/health', async (req, res) => {
    try {
      const { certificateQueue, emailQueue, reportQueue } = getQueues();
      const [certCounts, emailCounts, reportCounts] = await Promise.all([
        certificateQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed', 'paused'),
        emailQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed', 'paused'),
        reportQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed', 'paused')
      ]);
      res.json({
        status: 'ok',
        queues: {
          'certificate-generation': certCounts,
          'email-delivery': emailCounts,
          'event-report': reportCounts
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch queue health', details: error.message });
    }
  });

  /**
   * GET /api/admin/queues/:queueName/jobs?status=failed&page=1&size=20
   * List jobs in a specific queue filtered by status.
   */
  router.get('/:queueName/jobs', async (req, res) => {
    try {
      const queue = getQueueByName(req.params.queueName);
      if (!queue) return res.status(404).json({ error: 'Queue not found' });

      const status = req.query.status || 'failed';
      const page = Math.max(1, Number(req.query.page) || 1);
      const size = Math.min(100, Math.max(1, Number(req.query.size) || 20));
      const start = (page - 1) * size;
      const end = start + size - 1;

      const jobs = await queue.getJobs([status], start, end);
      const total = (await queue.getJobCounts(status))[status] || 0;

      res.json({
        queue: req.params.queueName,
        status,
        total,
        page,
        size,
        jobs: jobs.map(j => ({
          id: j.id,
          name: j.name,
          data: j.data,
          progress: j.progress,
          attemptsMade: j.attemptsMade,
          failedReason: j.failedReason,
          createdAt: new Date(j.timestamp).toISOString(),
          processedOn: j.processedOn ? new Date(j.processedOn).toISOString() : null,
          finishedOn: j.finishedOn ? new Date(j.finishedOn).toISOString() : null
        }))
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list jobs', details: error.message });
    }
  });

  /**
   * POST /api/admin/queues/:queueName/jobs/:jobId/retry
   * Retry a failed job.
   */
  router.post('/:queueName/jobs/:jobId/retry', async (req, res) => {
    try {
      const queue = getQueueByName(req.params.queueName);
      if (!queue) return res.status(404).json({ error: 'Queue not found' });

      const job = await queue.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });

      await job.retry();
      res.json({ message: 'Job retried', jobId: job.id });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retry job', details: error.message });
    }
  });

  /**
   * DELETE /api/admin/queues/:queueName/jobs/:jobId
   * Remove a job from the queue.
   */
  router.delete('/:queueName/jobs/:jobId', async (req, res) => {
    try {
      const queue = getQueueByName(req.params.queueName);
      if (!queue) return res.status(404).json({ error: 'Queue not found' });

      const job = await queue.getJob(req.params.jobId);
      if (!job) return res.status(404).json({ error: 'Job not found' });

      await job.remove();
      res.json({ message: 'Job removed', jobId: req.params.jobId });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove job', details: error.message });
    }
  });

  /**
   * POST /api/admin/queues/:queueName/drain
   * Drain all waiting jobs from a queue.
   */
  router.post('/:queueName/drain', async (req, res) => {
    try {
      const queue = getQueueByName(req.params.queueName);
      if (!queue) return res.status(404).json({ error: 'Queue not found' });

      await queue.drain();
      res.json({ message: `Queue ${req.params.queueName} drained` });
    } catch (error) {
      res.status(500).json({ error: 'Failed to drain queue', details: error.message });
    }
  });

  return router;
}

const QUEUE_MAP = {
  'certificate-generation': 'certificateQueue',
  'email-delivery': 'emailQueue',
  'event-report': 'reportQueue'
};

function getQueueByName(name) {
  const key = QUEUE_MAP[name];
  if (!key) return null;
  const queues = getQueues();
  return queues[key];
}

module.exports = { buildDashboardRouter };
