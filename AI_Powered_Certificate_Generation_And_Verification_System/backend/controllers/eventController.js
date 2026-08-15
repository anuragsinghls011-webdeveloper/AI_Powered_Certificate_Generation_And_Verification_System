const { getEventsCol } = require('../config/db');
const { uuidv4, nowISO } = require('../utils/helpers');

// GET /api/events
async function getAllEvents(req, res) {
  try {
    const events = await getEventsCol().find({}, { projection: { _id: 0 } }).toArray();
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// POST /api/events
async function createEvent(req, res) {
  try {
    const event = {
      id: uuidv4(),
      title: req.body.title,
      category: req.body.category || 'Workshop',
      date: req.body.date || new Date().toISOString().split('T')[0],
      description: req.body.description || '',
      organizer: req.body.organizer,
      location: req.body.location || 'Main Campus',
      created_at: nowISO()
    };
    await getEventsCol().insertOne(event);
    const { _id, ...cleanEvent } = event;
    res.json({ message: 'Event created successfully', event: cleanEvent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// DELETE /api/events/:id
async function deleteEvent(req, res) {
  try {
    const result = await getEventsCol().deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAllEvents, createEvent, deleteEvent };
