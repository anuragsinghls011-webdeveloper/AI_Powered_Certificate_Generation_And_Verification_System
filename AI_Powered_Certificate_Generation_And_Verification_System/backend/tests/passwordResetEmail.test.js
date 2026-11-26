const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const nodemailer = require('nodemailer');
const { sha256 } = require('../utils/tokens');
const { verifyPassword } = require('../utils/passwords');

Object.assign(process.env, {
  APP_URL: 'https://api.example.test', FRONTEND_URL: 'https://app.example.test/',
  JWT_SECRET: 'reset-test-only', CERT_STORAGE_DIR: 'unused',
  EMAIL_PROVIDER: 'nodemailer', SMTP_HOST: 'smtp.gmail.com', SMTP_PORT: '587',
  SMTP_USER: 'sender@example.test', SMTP_PASS: 'abcd efgh ijkl mnop'
});
for (const name of [
  'API_JSON_BYTES', 'TEMPLATE_JSON_BYTES', 'BULK_MAX_FILE_SIZE', 'BULK_MAX_ROWS', 'BULK_MAX_COLS',
  'BULK_EXPANDED_BYTES', 'BULK_PAYLOAD_BYTES', 'TEMPLATE_MAX_FIELDS', 'IMAGE_MAX_BYTES',
  'IMAGE_MAX_PIXELS', 'WORKER_MEMORY_MB', 'WORK_TIMEOUT_MS', 'WORK_CONCURRENCY', 'JOB_WORKERS',
  'JOB_QUEUE_LIMIT', 'JOB_MAX_ATTEMPTS', 'JOB_LEASE_MS', 'JOB_POLL_MS', 'WORK_RATE_WINDOW_SECONDS',
  'WORK_RATE_LIMIT', 'REPORT_MAX_ROWS'
]) process.env[name] = '100';

test('a mailed reset link changes the password once and a rejected email leaves no usable token', async t => {
  const user = { id: 'test-user', email: 'member@example.test' };
  const records = new Map();
  const session = { user_id: user.id, revoked_at: null };
  let mail;
  let rejectMail = false;
  t.mock.method(nodemailer, 'createTransport', options => {
    assert.equal(options.auth.pass, 'abcdefghijklmnop');
    assert.equal(options.requireTLS, true);
    return { sendMail: async message => {
      mail = message;
      return rejectMail ? { accepted: [], rejected: [message.to] }
        : { messageId: 'test-message', accepted: [message.to], rejected: [] };
    } };
  });
  const collections = {
    users: {
      findOne: async ({ email }) => email === user.email ? user : null,
      updateOne: async ({ id }, update) => { assert.equal(id, user.id); Object.assign(user, update.$set); }
    },
    sessions: {
      updateMany: async (filter, update) => { assert.equal(filter.user_id, session.user_id); Object.assign(session, update.$set); }
    },
    work_rates: { findOneAndUpdate: async () => ({ count: 1 }) },
    audit_logs: { insertOne: async () => ({}) },
    password_reset_tokens: {
      insertOne: async row => {
        records.set(row.token_hash, { ...row, _id: row.token_hash });
        return { insertedId: row.token_hash };
      },
      findOne: async query => {
        const row = records.get(query.token_hash);
        return row && row.used_at === query.used_at ? { ...row } : null;
      },
      updateOne: async (filter, update) => {
        const row = records.get(filter._id);
        if (row.used_at !== filter.used_at || row.expires_at <= filter.expires_at.$gt) return { modifiedCount: 0 };
        Object.assign(row, update.$set);
        return { modifiedCount: 1 };
      },
      deleteOne: async ({ _id }) => records.delete(_id)
    }
  };
  t.mock.method(require('../config/db'), 'getDB', () => ({ collection: name => collections[name] }));
  const app = express();
  app.use(express.json());
  app.use('/api/auth', require('../routes/authRoutes'));
  const server = await new Promise(resolve => {
    const http = app.listen(0, '127.0.0.1', () => resolve(http));
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const post = (route, body) => fetch(`http://127.0.0.1:${server.address().port}/api/auth/${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const requestLink = email => post('forgot-password', { email });
  const publicResponse = await (await requestLink(user.email)).json();
  assert.equal(mail.to, user.email);
  const link = new URL(mail.text.split(' ').pop());
  assert.equal(link.origin + link.pathname, 'https://app.example.test/auth/reset-password');
  const token = link.searchParams.get('token');
  const row = records.get(sha256(token));
  assert.ok(row.expires_at > new Date());
  const reset = () => post('reset-password', { token, new_password: 'Changed123' });
  const replies = await Promise.all([reset(), reset()]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 400]);
  assert.ok(await verifyPassword('Changed123', user.password_hash));
  assert.equal(session.revoke_reason, 'password_reset');

  rejectMail = true;
  assert.deepEqual(await (await requestLink(user.email)).json(), publicResponse);
  assert.deepEqual(await (await requestLink('unknown@example.test')).json(), publicResponse);
  assert.equal(records.size, 1);
  assert.ok(row.used_at);
});

test('Resend still sends attachments and applies its configured test recipient', async t => {
  Object.assign(process.env, { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-key', SENDER_EMAIL: 'sender@example.test',
    RESEND_TEST_MODE: 'true', RESEND_TEST_RECIPIENT: 'preview@example.test' });
  delete require.cache[require.resolve('../utils/emailService')];
  t.mock.method(require('../services/workload'), 'withSlot', async (kind, task) => task());
  let payload;
  t.mock.method(global, 'fetch', async (url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ id: 'test-resend-id' });
  });
  const result = await require('../utils/emailService').sendEmail({
    to: 'member@example.test', subject: 'Certificate', text: 'Attached',
    attachments: [{ filename: 'certificate.pdf', content: Buffer.from('sample') }]
  });
  assert.equal(result.delivered, true);
  assert.equal(result.email_id, 'test-resend-id');
  assert.deepEqual(payload.to, ['preview@example.test']);
  assert.equal(payload.attachments[0].content, Buffer.from('sample').toString('base64'));
});
