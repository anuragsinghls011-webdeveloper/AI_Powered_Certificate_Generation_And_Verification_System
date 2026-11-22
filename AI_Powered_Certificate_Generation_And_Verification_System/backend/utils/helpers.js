const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate a unique, unguessable certificate ID in the format CERT-YYYY-XXXXXXXXXXXXXXXX (64-bit random hex)
 */
function generateCertId() {
  return `CERT-${new Date().getFullYear()}-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
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
