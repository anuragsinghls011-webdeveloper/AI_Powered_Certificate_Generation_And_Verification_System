const express = require('express');
const router = express.Router();
const { getAllEvents, createEvent, deleteEvent } = require('../controllers/eventController');
const { resolveOrganization, requirePermission } = require('../middleware/authMiddleware');

router.get('/', getAllEvents);
// Bind new events to a verified membership, never to a client-supplied owner.
router.post('/', (req, res, next) => {
  Promise.resolve(resolveOrganization()(req, res, next)).catch(() =>
    res.status(500).json({ error: 'Unable to verify event access. Please try again.' }));
}, requirePermission('events.create'), createEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
