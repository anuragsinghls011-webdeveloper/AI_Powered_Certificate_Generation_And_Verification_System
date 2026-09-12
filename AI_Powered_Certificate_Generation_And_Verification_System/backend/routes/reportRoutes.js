const express = require('express');
const mw = require('../middleware/authMiddleware');
const controller = require('../controllers/reportController');
const { workLimit } = require('../services/workload');

const router = express.Router();
let activeDownloads = 0;
function reportCapacity(req, res, next) {
  if (activeDownloads >= 2) return res.status(429).json({ error: 'Reports are busy right now. Please try again shortly.' });
  activeDownloads++;
  let released = false;
  const release = () => { if (!released) { released = true; activeDownloads--; } };
  res.once('finish', release);
  res.once('close', release);
  next();
}
// Keep all report data (including the event selector) behind the same boundary.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
router.use((req, res, next) => {
  Promise.resolve(mw.resolveOrganization()(req, res, next)).catch(next);
});
router.use((req, res, next) => {
  if (!['admin', 'super_admin'].includes(req.membership?.role)) {
    return res.status(403).json({ error: 'Event Reports is available to organization admins only.' });
  }
  next();
});
router.use(mw.requirePermission('events.read'), mw.requirePermission('certificates.read'));
router.get('/events', controller.listEvents);
router.get('/events/:event_id/summary', controller.eventSummary);
router.get('/events/:event_id', workLimit('report'), reportCapacity, controller.downloadReport);
router.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Event report request failed:', err.name);
  res.status(err.status || 500).json({
    error: err.publicMessage || 'Unable to generate the event report. Please try again.'
  });
});

module.exports = router;