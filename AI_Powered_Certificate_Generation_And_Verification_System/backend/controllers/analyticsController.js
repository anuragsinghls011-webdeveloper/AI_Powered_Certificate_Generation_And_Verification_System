const { getCertificatesCol, getEventsCol, getTemplatesCol } = require('../config/db');
const { scope, templateScope } = require('../utils/tenant');

// GET /api/analytics
async function getAnalytics(req, res) {
  try {
    const certificatesCol = getCertificatesCol();

    const totalCerts = await certificatesCol.countDocuments(scope(req));
    const totalEvents = await getEventsCol().countDocuments(scope(req));
    const totalTemplates = await getTemplatesCol().countDocuments(templateScope(req));
    const revokedCerts = await certificatesCol.countDocuments({ ...scope(req), status: 'Revoked' });
    const activeCerts = totalCerts - revokedCerts;

    const pipeline = [
      { $match: scope(req) },
      { $group: { _id: '$event_category', count: { $sum: 1 } } }
    ];
    const categoryStats = await certificatesCol.aggregate(pipeline).toArray();

    res.json({
      total_certificates: totalCerts,
      active_certificates: activeCerts,
      revoked_certificates: revokedCerts,
      total_events: totalEvents,
      total_templates: totalTemplates,
      category_breakdown: categoryStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getAnalytics };
