const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URL = process.env.MONGO_URL || 'mongodb+srv://arjun730099_db_user:V6iMmwJlkSMf8tqM@internal.cwlg295.mongodb.net/';
const DB_NAME = process.env.DB_NAME || 'cert_management_db';

let db;
let client;

async function connectDB() {
  try {
    client = new MongoClient(MONGO_URL);
    await client.connect();
    db = client.db(DB_NAME);
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
