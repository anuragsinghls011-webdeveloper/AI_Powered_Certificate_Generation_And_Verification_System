const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URL = process.env.MONGO_URL;
const DB_NAME = process.env.DB_NAME;

let db;
let client;

async function connectDB() {
  try {
    client = new MongoClient(MONGO_URL);
    await client.connect();
    db = client.db(DB_NAME);
    // Indexes for fast querying, multi-tenant scoping, and instant verification
    await Promise.all([
      db.collection('certificates').createIndex({ cert_id: 1 }, { unique: true }),
      db.collection('certificates').createIndex({ organization_id: 1, created_at: -1 }),
      db.collection('certificates').createIndex({ organization_id: 1, status: 1 }),
      db.collection('certificates').createIndex({ event_id: 1, cert_id: 1 }),
      db.collection('events').createIndex({ id: 1, organization_id: 1 }),
      db.collection('events').createIndex({ organization_id: 1, date: -1 }),
      db.collection('events').createIndex({ status: 1, 'report_delivery.status': 1 }),
      db.collection('templates').createIndex({ id: 1 }),
      db.collection('templates').createIndex({ organization_id: 1 }),
      db.collection('organizations').createIndex({ id: 1 }),
      db.collection('bulk_jobs').createIndex({ id: 1, organization_id: 1 }),
      db.collection('bulk_jobs').createIndex({ status: 1, next_attempt_at: 1, lease_until: 1 }),
      db.collection('bulk_records').createIndex({ job_id: 1, organization_id: 1, status: 1 })
    ]);
    console.log('Connected to MongoDB successfully');
    return db;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    throw err;
  }
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call connectDB() first.');
  return db;
}

function getEventsCol() {
  return getDB().collection('events');
}

function getTemplatesCol() {
  return getDB().collection('templates');
}

function getCertificatesCol() {
  return getDB().collection('certificates');
}

module.exports = {
  connectDB,
  getDB,
  getEventsCol,
  getTemplatesCol,
  getCertificatesCol
};
