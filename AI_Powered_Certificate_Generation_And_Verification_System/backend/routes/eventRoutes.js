const express = require('express');
const router = express.Router();
const { getAllEvents, createEvent, deleteEvent, completeEvent, retryEventReport } = require('../controllers/eventController');
const { resolveOrganization, requirePermission } = require('../middleware/authMiddleware');

router.get('/', getAllEvents);
// Bind new events to a verified membership, never to a client-supplied owner.
router.post('/', (req, res, next) => {
  Promise.resolve(resolveOrganization()(req, res, next)).catch(() =>
    res.status(500).json({ error: 'Unable to verify event access. Please try again.' }));
}, requirePermission('events.create'), createEvent);
const adminEventAction = [
  (req, res, next) => Promise.resolve(resolveOrganization()(req, res, next)).catch(next),
  requirePermission('events.create'),
  (req, res, next) => ['admin', 'super_admin'].includes(req.membership?.role)
    ? next() : res.status(403).json({ error: 'Only organization admins can complete events.' })
];
router.post('/:id/complete', ...adminEventAction, completeEvent);
router.post('/:id/report-delivery/retry', ...adminEventAction, retryEventReport);
router.delete('/:id', deleteEvent);

module.exports = router;
