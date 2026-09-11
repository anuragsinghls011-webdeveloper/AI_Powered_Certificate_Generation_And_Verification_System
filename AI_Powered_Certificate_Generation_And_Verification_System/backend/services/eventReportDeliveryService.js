const { getEventsCol, getCertificatesCol } = require('../config/db');
const { runReportWorker } = require('./eventReportWorker');
const { summarize, reportFilename, MAX_REPORT_ROWS } = require('./eventReportService');
const { certificateFilter } = require('../controllers/reportController');
const { eventReportTemplate } = require('./emailTemplates');
const { sendEmail } = require('../utils/emailService');

async function organizationAdmins(db, organizationId) {
  const memberships = await db.collection('organization_memberships').find({
    organization_id: organizationId,
    role: { $in: ['admin', 'super_admin'] },
    status: 'active'
  }, { projection: { _id: 0, user_id: 1, role: 1 } }).toArray();
  const userIds = memberships.map(item => item.user_id);
  if (!userIds.length) return [];
  return db.collection('users').find({
    id: { $in: userIds }, status: { $ne: 'suspended' }, email: { $type: 'string', $ne: '' }
  }, { projection: { _id: 0, id: 1, name: 1, email: 1 } }).toArray();
}

async function processEventReportDelivery(db, event) {
  const certificates = await getCertificatesCol().find(certificateFilter(event), {
    projection: { _id: 0, cert_id: 1, recipient_name: 1, recipient_email: 1, issue_date: 1,
      status: 1, metadata: 1, role: 1, grade: 1 }
  }).sort({ cert_id: 1 }).limit(MAX_REPORT_ROWS + 1).toArray();
  if (certificates.length > MAX_REPORT_ROWS) throw new Error(`Event exceeds the ${MAX_REPORT_ROWS}-certificate email report limit`);

  const cleanEvent = {
    id: String(event.id || event._id),
    title: String(event.title || event.name || 'Untitled event'),
    date: event.date instanceof Date ? event.date.toISOString() : String(event.date || '')
  };
  const [xlsx, csv] = await Promise.all([
    runReportWorker({ event: cleanEvent, certificates, format: 'xlsx' }),
    runReportWorker({ event: cleanEvent, certificates, format: 'csv' })
  ]);
  const admins = await organizationAdmins(db, event.organization_id);
  if (!admins.length) throw new Error('No active organization admin email addresses were found');
  const summary = summarize(certificates);
  const recipients = [];

  for (const admin of admins) {
    const content = eventReportTemplate({
      adminName: admin.name,
      eventTitle: cleanEvent.title,
      summary,
      completedAt: event.completed_at
    });
    const result = await sendEmail({
      to: admin.email,
      ...content,
      attachments: [
        { filename: reportFilename(cleanEvent.title, 'xlsx'), content: Buffer.from(xlsx) },
        { filename: reportFilename(cleanEvent.title, 'csv'), content: Buffer.from(csv) }
      ],
      idempotencyKey: `event-report/${cleanEvent.id}/${admin.id}/delivery-v1`
    });
    recipients.push({
      user_id: admin.id,
      intended_email: admin.email,
      actual_email: result.actual_recipients?.[0] || null,
      status: result.delivered ? 'sent' : 'failed',
      email_id: result.email_id || null,
      error: result.delivered ? null : result.error
    });
  }

  const failed = recipients.filter(item => item.status === 'failed');
  await getEventsCol().updateOne({ _id: event._id }, { $set: {
    'report_delivery.status': failed.length ? 'failed' : 'sent',
    'report_delivery.completed_at': new Date().toISOString(),
    'report_delivery.recipients': recipients,
    'report_delivery.error': failed.length ? `${failed.length} admin delivery attempt(s) failed` : null
  } });
  await db.collection('audit_logs').insertOne({
    action: failed.length ? 'EVENT_REPORT_EMAIL_FAILED' : 'EVENT_REPORT_EMAIL_SENT',
    event_id: cleanEvent.id,
    organization_id: event.organization_id,
    recipient_count: recipients.length,
    timestamp: new Date().toISOString()
  });
}

module.exports = { processEventReportDelivery, organizationAdmins };