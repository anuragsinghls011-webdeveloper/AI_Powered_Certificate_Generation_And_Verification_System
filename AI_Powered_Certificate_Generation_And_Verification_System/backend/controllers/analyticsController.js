const { getCertificatesCol, getEventsCol, getTemplatesCol } = require('../config/db');

// GET /api/analytics
async function getAnalytics(req, res) {
  try {
    const certificatesCol = getCertificatesCol();

    const totalCerts = await certificatesCol.countDocuments();
    const totalEvents = await getEventsCol().countDocuments();
    const totalTemplates = await getTemplatesCol().countDocuments();
    const revokedCerts = await certificatesCol.countDocuments({ status: 'Revoked' });
    const activeCerts = totalCerts - revokedCerts;

    const pipeline = [
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
