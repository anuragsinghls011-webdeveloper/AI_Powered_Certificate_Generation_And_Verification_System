const { processEventReportDelivery } = require('./eventReportDeliveryService');

let timer = null;
let busy = false;

async function tick(db) {
  if (busy) return;
  busy = true;
  let event;
  try {
    event = await db.collection('events').findOneAndUpdate(
      { status: 'completed', 'report_delivery.status': 'queued' },
      { $set: { 'report_delivery.status': 'processing', 'report_delivery.started_at': new Date().toISOString() },
        $inc: { 'report_delivery.attempts': 1 } },
      { returnDocument: 'after' }
    );
    if (event) await processEventReportDelivery(db, event);
  } catch (error) {
    console.error('[EVENT-REPORT-EMAIL]', error.message || error);
    if (event?._id) {
      await db.collection('events').updateOne({ _id: event._id }, { $set: {
        'report_delivery.status': 'failed',
        'report_delivery.error': error.message || 'Unable to email event reports',
        'report_delivery.completed_at': new Date().toISOString()
      } });
    }
  } finally {
    busy = false;
  }
}

async function startEventReportScheduler(db) {
  const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await db.collection('events').updateMany({
    status: 'completed', 'report_delivery.status': 'processing', 'report_delivery.started_at': { $lt: staleBefore }
  }, { $set: { 'report_delivery.status': 'queued' } });
  if (timer) clearInterval(timer);
  timer = setInterval(() => tick(db), 3000);
  timer.unref();
  setImmediate(() => tick(db));
}

module.exports = { startEventReportScheduler, tick };