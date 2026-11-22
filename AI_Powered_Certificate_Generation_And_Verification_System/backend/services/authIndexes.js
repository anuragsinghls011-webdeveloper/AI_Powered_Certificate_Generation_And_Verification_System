// Auth indexes must be created after MongoDB connects and before requests are served.
async function initializeAuthIndexes(db) {
  await db.collection('users').createIndex({ email: 1 }, { unique: true });
  await db.collection('sessions').createIndex({ user_id: 1 });
  await db.collection('sessions').createIndex({ token_hash: 1 });
  await db.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('email_verification_tokens').createIndex({ token_hash: 1 });
  await db.collection('email_verification_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('registration_otps').createIndex({ email: 1 }, { unique: true });
  await db.collection('registration_otps').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('password_reset_tokens').createIndex({ token_hash: 1 });
  await db.collection('password_reset_tokens').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 });
  await db.collection('login_attempts').createIndex({ identifier: 1 });
  await db.collection('login_attempts').createIndex({ last_attempt: 1 }, { expireAfterSeconds: 15 * 60 * 4 });
  await db.collection('organizations').createIndex({ slug: 1 }, { unique: true, sparse: true });
  await db.collection('organization_memberships').createIndex({ user_id: 1, organization_id: 1 }, { unique: true });
}

module.exports = { initializeAuthIndexes };
