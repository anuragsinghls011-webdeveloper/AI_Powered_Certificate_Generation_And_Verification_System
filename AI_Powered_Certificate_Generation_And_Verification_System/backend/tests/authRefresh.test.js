const test = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_URL ||= 'http://localhost:3000';
process.env.JWT_SECRET ||= 'refresh-regression-secret';
process.env.CERT_STORAGE_DIR ||= '/tmp/campuscert-test';
for (const name of [
  'API_JSON_BYTES', 'TEMPLATE_JSON_BYTES', 'BULK_MAX_FILE_SIZE', 'BULK_MAX_ROWS',
  'BULK_MAX_COLS', 'BULK_EXPANDED_BYTES', 'BULK_PAYLOAD_BYTES', 'TEMPLATE_MAX_FIELDS',
  'IMAGE_MAX_BYTES', 'IMAGE_MAX_PIXELS', 'WORKER_MEMORY_MB', 'WORK_TIMEOUT_MS',
  'WORK_CONCURRENCY', 'JOB_WORKERS', 'JOB_QUEUE_LIMIT', 'JOB_MAX_ATTEMPTS',
  'JOB_LEASE_MS', 'JOB_POLL_MS', 'WORK_RATE_WINDOW_SECONDS', 'WORK_RATE_LIMIT',
  'REPORT_MAX_ROWS'
]) process.env[name] ||= '100';

const { generateRefreshToken, sha256 } = require('../utils/tokens');
const user = { id: 'user-a', email: 'user@example.com', current_org_id: 'org-a', status: 'active' };
const original = generateRefreshToken(user, 'session-a');
const sessions = new Map([['session-a', {
  id: 'session-a', user_id: user.id, token_hash: sha256(original.token),
  expires_at: new Date(Date.now() + 60000), revoked_at: null
}]]);

const dbModule = require('../config/db');
dbModule.getDB = () => ({ collection: name => {
  if (name === 'sessions') return {
    findOne: async filter => {
      const session = sessions.get(filter.id);
      return session && session.user_id === filter.user_id && session.revoked_at === null &&
        session.expires_at > filter.expires_at.$gt ? session : null;
    },
    findOneAndUpdate: async (filter, update) => {
      const session = sessions.get(filter.id);
      if (!session || session.user_id !== filter.user_id ||
          session.token_hash !== filter.token_hash || session.revoked_at ||
          session.expires_at <= filter.expires_at.$gt) return null;
      const before = { ...session };
      Object.assign(session, update.$set);
      return before;
    },
    insertOne: async session => { sessions.set(session.id, session); return { insertedId: session.id }; }
  };
  if (name === 'users') return { findOne: async () => user };
  if (name === 'organization_memberships') return { findOne: async () => ({ organization_id: 'org-a', role: 'admin' }) };
  if (name === 'audit_logs') return { insertOne: async () => ({}) };
  throw new Error(`Unexpected collection ${name}`);
} });

test('concurrent refresh requests create one successor without revoking it', async () => {
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/refresh`;
    const request = () => fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: original.token })
    });
    const results = await Promise.all([request(), request()]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
    const successful = results.find(result => result.status === 200);
    const { access_token: accessToken } = await successful.json();
    const successor = [...sessions.values()].find(session => session.rotated_from === 'session-a');
    assert.ok(successor);
    assert.equal(successor.revoked_at, null);

    const { authenticateUser } = require('../middleware/authMiddleware');
    const authenticate = async () => {
      const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
      };
      let admitted = false;
      await authenticateUser()({ headers: { authorization: `Bearer ${accessToken}` } }, response, () => { admitted = true; });
      return { admitted, response };
    };
    assert.equal((await authenticate()).admitted, true);
    successor.revoked_at = new Date().toISOString();
    const rejected = await authenticate();
    assert.equal(rejected.admitted, false);
    assert.equal(rejected.response.statusCode, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
