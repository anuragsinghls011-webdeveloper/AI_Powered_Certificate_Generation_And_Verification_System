// Audit log helper
async function logAudit(db, entry) {
  try {
    await db.collection('audit_logs').insertOne({
      ...entry,
      timestamp: new Date().toISOString()
    });
  } catch (e) { /* audit failures should never break the request */ }
}
module.exports = { logAudit };
