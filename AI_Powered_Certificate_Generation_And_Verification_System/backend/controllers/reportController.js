const { ObjectId } = require('mongodb');
const { getEventsCol, getCertificatesCol } = require('../config/db');
const { runReportWorker } = require('../services/eventReportWorker');
const { summarize, reportFilename, MAX_REPORT_ROWS } = require('../services/eventReportService');

const wrap = handler => (req, res, next) => Promise.resolve(handler(req, res)).catch(next);
const fail = (status, message) => Object.assign(new Error(message), { status, publicMessage: message });
const scope = req => ({ organization_id: req.organization.id });
const eventFields = { id: 1, title: 1, name: 1, date: 1, organization_id: 1 };
const cleanEvent = event => ({
  id: String(event.id || event._id),
  title: typeof (event.title ?? event.name) === 'string' ? (event.title ?? event.name) : 'Untitled event',
  date: event.date instanceof Date ? event.date.toISOString() : typeof event.date === 'string' ? event.date : ''
});

async function selectedEvent(req) {
  const id = req.params.event_id;
  // Existing UUIDs AND seeded IDs such as evt-hack-2025 are valid. Never accept query objects.
  if (typeof id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(id)) {
    throw fail(400, 'Invalid event ID.');
  }
  const identity = /^[a-fA-F0-9]{24}$/.test(id)
    ? { $or: [{ id }, { _id: new ObjectId(id) }] } : { id };
  const event = await getEventsCol().findOne({ ...scope(req), ...identity }, { projection: eventFields });
  // Same response for nonexistent and inaccessible IDs: no event-existence disclosure.
  if (!event) throw fail(404, 'Event not found or you do not have access to it.');
  return event;
}

function certificateFilter(event) {
  // The actual app writes events.id into event_id. Support native _id references too,
  // but never match on a name, title, or an absent/null relationship.
  const ids = [event._id, String(event._id)];
  if (typeof event.id === 'string' && event.id) ids.push(event.id);
  return { organization_id: event.organization_id, event_id: { $in: ids } };
}

const listEvents = wrap(async (req, res) => {
  const events = await getEventsCol().find(scope(req), { projection: eventFields }).sort({ date: -1, _id: 1 }).toArray();
  res.json({ events: events.map(cleanEvent) });
});

const eventSummary = wrap(async (req, res) => {
  const event = await selectedEvent(req);
  const groups = await getCertificatesCol().aggregate([
    { $match: certificateFilter(event) },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();
  res.json({ event: cleanEvent(event), ...summarize(groups.map(g => ({ status: g._id, count: g.count }))) });
});

const downloadReport = wrap(async (req, res) => {
  const format = req.query.format === undefined ? 'xlsx' : req.query.format;
  if (!['xlsx', 'csv'].includes(format)) throw fail(400, 'Choose a valid export format: xlsx or csv.');
  const event = await selectedEvent(req);
  // Project only report fields: exclude PDF paths, QR images, and unrelated data.
  const certificates = await getCertificatesCol().find(certificateFilter(event), {
    projection: { _id: 0, cert_id: 1, recipient_name: 1, recipient_email: 1, issue_date: 1,
      status: 1, metadata: 1, role: 1, grade: 1 }
  }).sort({ cert_id: 1 }).limit(MAX_REPORT_ROWS + 1).maxTimeMS(30000).toArray();
  if (!certificates.length) throw fail(422, 'No certificates found for this event.');
  if (certificates.length > MAX_REPORT_ROWS) throw fail(413, `This event exceeds the ${MAX_REPORT_ROWS.toLocaleString('en-US')}-certificate report limit.`);
  if (res.destroyed) return;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once('close', cancel);
  try {
    const bytes = await runReportWorker({ event: cleanEvent(event), certificates, format }, controller.signal);
    if (res.destroyed) return;
    res.set({
      'Content-Type': format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${reportFilename(cleanEvent(event).title, format)}"`,
      'Access-Control-Expose-Headers': 'Content-Disposition',
      'X-Content-Type-Options': 'nosniff'
    });
    res.send(Buffer.from(bytes));
  } finally {
    res.off('close', cancel);
  }
});

module.exports = { listEvents, eventSummary, downloadReport, certificateFilter };