const { getCertificatesCol, getEventsCol, getTemplatesCol } = require('../config/db');
const { scope, templateScope } = require('../utils/tenant');

// GET /api/analytics
async function getAnalytics(req, res) {
  try {
    const certificatesCol = getCertificatesCol();
    const reqScope = scope(req);
    const pipeline = [
      { $match: reqScope },
      { $group: { _id: '$event_category', count: { $sum: 1 } } }
    ];

    // Execute queries in parallel for maximum speed
    const [totalCerts, totalEvents, totalTemplates, revokedCerts, categoryStats] = await Promise.all([
      certificatesCol.countDocuments(reqScope),
      getEventsCol().countDocuments(reqScope),
      getTemplatesCol().countDocuments(templateScope(req)),
      certificatesCol.countDocuments({ ...reqScope, status: 'Revoked' }),
      certificatesCol.aggregate(pipeline).toArray()
    ]);

    const activeCerts = totalCerts - revokedCerts;

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
