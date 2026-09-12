const { getDB } = require('../config/db');
const { requirePermission } = require('../middleware/authMiddleware');
const scope = req => ({ organization_id: req.organization.id });
const sharedTemplates = { organization_id: { $exists: false }, id: { $in: ['tpl-modern', 'tpl-classic'] } };
const templateScope = req => ({ $or: [scope(req), sharedTemplates] });
const scoped = (filter, boundary) => ({ $and: [boundary, filter || {}] });
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
    throw Object.assign(new Error('Invalid resource ID'), { statusCode: 400 });
  }
  return value;
};
async function issuanceResources(req, eventId, templateId) {
  const db = getDB();
  const [event, template] = await Promise.all([
    db.collection('events').findOne({ ...scope(req), id: id(eventId) }),
    db.collection('templates').findOne(scoped({ id: id(templateId) }, templateScope(req)))
  ]);
  if (!event || !template) throw Object.assign(new Error('Event or template not found'), { statusCode: 404 });
  return { event, template };
}
// Bulk handlers receive only an explicitly scoped native-driver facade. No raw fallback.
function tenantDatabase(raw, req) {
  return { collection(name) {
    if (!['bulk_uploads', 'bulk_jobs', 'bulk_records', 'bulk_saved_mappings', 'certificates', 'templates', 'events', 'audit_logs'].includes(name)) throw new Error('Unsupported tenant collection');
    const col = raw.collection(name);
    const boundary = name === 'templates' ? templateScope(req) : scope(req);
    const filter = q => scoped(q, boundary);
    const owned = doc => ({ ...doc, organization_id: req.organization.id, created_by: req.user.id });
    return {
      find: (q, options) => col.find(filter(q), options),
      findOne: (q, options) => col.findOne(filter(q), options),
      countDocuments: (q, options) => col.countDocuments(filter(q), options),
      aggregate: (pipeline, options) => col.aggregate([{ $match: boundary }, ...pipeline], options),
      insertOne: (doc, options) => col.insertOne(owned(doc), options),
      insertMany: (docs, options) => col.insertMany(docs.map(owned), options),
      updateOne: (q, change, options) => col.updateOne(scoped(q, scope(req)), change, options),
      deleteOne: q => col.deleteOne(scoped(q, scope(req)))
    };
  } };
}
module.exports = { scope, sharedTemplates, templateScope, scoped, wrap, id, issuanceResources, tenantDatabase, requirePermission };