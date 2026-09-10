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
    // Report queries always start with an event relationship or organization scope.
    await db.collection('certificates').createIndex({ event_id: 1, cert_id: 1 });
    await db.collection('events').createIndex({ organization_id: 1, date: -1 });
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
