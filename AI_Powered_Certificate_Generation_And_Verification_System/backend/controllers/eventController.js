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
      organization_id: req.organization.id,
      created_by: req.user.id,
      title: req.body.title,
      category: req.body.category || 'Workshop',
      date: req.body.date || new Date().toISOString().split('T')[0],
      description: req.body.description || '',
      organizer: req.body.organizer,
      location: req.body.location || 'Main Campus',
      status: 'active',
      report_delivery: { status: 'not_started', attempts: 0 },
      created_at: nowISO()
    };
    await getEventsCol().insertOne(event);
    const { _id, ...cleanEvent } = event;
    res.json({ message: 'Event created successfully', event: cleanEvent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function completeEvent(req, res) {
  try {
    const completedAt = nowISO();
    const event = await getEventsCol().findOneAndUpdate({
      id: req.params.id,
      organization_id: req.organization.id,
      status: { $ne: 'completed' }
    }, { $set: {
      status: 'completed',
      completed_at: completedAt,
      completed_by: req.user.id,
      report_delivery: { status: 'queued', attempts: 0, queued_at: completedAt }
    } }, { returnDocument: 'after', projection: { _id: 0 } });

    if (!event) {
      const existing = await getEventsCol().findOne({
        id: req.params.id,
        organization_id: req.organization.id
      }, { projection: { _id: 0, id: 1, status: 1, report_delivery: 1 } });
      if (!existing) return res.status(404).json({ error: 'Event not found or you do not have access to it.' });
      return res.json({ message: 'Event is already completed.', event: existing });
    }
    res.status(202).json({ message: 'Event completed. Admin report delivery is queued.', event });
  } catch (err) {
    res.status(500).json({ error: 'Unable to complete the event. Please try again.' });
  }
}

async function retryEventReport(req, res) {
  try {
    const queuedAt = nowISO();
    const event = await getEventsCol().findOneAndUpdate({
      id: req.params.id,
      organization_id: req.organization.id,
      status: 'completed',
      'report_delivery.status': 'failed'
    }, { $set: {
      'report_delivery.status': 'queued',
      'report_delivery.queued_at': queuedAt,
      'report_delivery.error': null
    } }, { returnDocument: 'after', projection: { _id: 0, id: 1, status: 1, report_delivery: 1 } });
    if (!event) return res.status(409).json({ error: 'Only failed report deliveries can be retried.' });
    res.status(202).json({ message: 'Event report delivery is queued for retry.', event });
  } catch (err) {
    res.status(500).json({ error: 'Unable to retry report delivery. Please try again.' });
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

module.exports = { getAllEvents, createEvent, deleteEvent, completeEvent, retryEventReport };
