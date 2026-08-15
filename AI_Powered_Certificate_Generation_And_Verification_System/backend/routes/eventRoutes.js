const express = require('express');
const router = express.Router();
const { getAllEvents, createEvent, deleteEvent } = require('../controllers/eventController');

router.get('/', getAllEvents);
router.post('/', createEvent);
router.delete('/:id', deleteEvent);

module.exports = router;
