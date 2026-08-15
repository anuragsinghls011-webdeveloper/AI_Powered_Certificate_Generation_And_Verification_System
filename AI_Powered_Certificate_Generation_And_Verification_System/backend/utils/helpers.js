const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique certificate ID in the format CERT-YYYY-XXXXXXXX
 */
function generateCertId() {
  return `CERT-${new Date().getFullYear()}-${uuidv4().slice(0, 8).toUpperCase()}`;
}

/**
 * Get today's date as YYYY-MM-DD string
 */
function todayISO() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Get current timestamp as ISO string
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Strip MongoDB _id from a document and return a clean copy
 */
function stripId(doc) {
  if (!doc) return doc;
  const { _id, ...clean } = doc;
  return clean;
}

module.exports = {
  uuidv4,
  generateCertId,
  todayISO,
  nowISO,
  stripId
};
