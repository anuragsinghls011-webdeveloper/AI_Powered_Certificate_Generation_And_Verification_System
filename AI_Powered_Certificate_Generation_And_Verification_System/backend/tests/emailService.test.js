const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');

Object.assign(process.env, {
  APP_URL: process.env.APP_URL || 'https://api.example.test',
  FRONTEND_URL: process.env.FRONTEND_URL || 'https://app.example.test/',
  JWT_SECRET: process.env.JWT_SECRET || 'email-test-only',
  CERT_STORAGE_DIR: process.env.CERT_STORAGE_DIR || 'unused'
});
for (const name of [
  'API_JSON_BYTES', 'TEMPLATE_JSON_BYTES', 'BULK_MAX_FILE_SIZE', 'BULK_MAX_ROWS', 'BULK_MAX_COLS',
  'BULK_EXPANDED_BYTES', 'BULK_PAYLOAD_BYTES', 'TEMPLATE_MAX_FIELDS', 'IMAGE_MAX_BYTES',
  'IMAGE_MAX_PIXELS', 'WORKER_MEMORY_MB', 'WORK_TIMEOUT_MS', 'WORK_CONCURRENCY', 'JOB_WORKERS',
  'JOB_QUEUE_LIMIT', 'JOB_MAX_ATTEMPTS', 'JOB_LEASE_MS', 'JOB_POLL_MS', 'WORK_RATE_WINDOW_SECONDS',
  'WORK_RATE_LIMIT', 'REPORT_MAX_ROWS'
]) process.env[name] ||= '100';

const servicePath = require.resolve('../utils/emailService');

function loadEmailService(env) {
  const keys = [
    'EMAIL_PROVIDER', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
    'SMTP_SENDER_EMAIL', 'SENDER_EMAIL', 'SMTP_POOL', 'SMTP_DISABLE_465_FALLBACK',
    'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'RESEND_API_KEY', 'RESEND_SENDER_EMAIL',
    'RESEND_TEST_MODE', 'RESEND_TEST_RECIPIENT'
  ];
  const prev = {};
  for (const k of keys) prev[k] = process.env[k];
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  delete require.cache[servicePath];
  const mod = require('../utils/emailService');
  return {
    mod,
    restore() {
      mod.resetNodemailerTransport();
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
      delete require.cache[servicePath];
    }
  };
}

test('Nodemailer retries on port 465 when port 587 times out and strips Gmail spaces/resend.dev sender', async t => {
  const calls = [];
  t.mock.method(nodemailer, 'createTransport', options => {
    calls.push(options);
    return {
      close() {},
      sendMail: async mail => {
        if (options.port === 587) {
          const err = new Error('Connection timeout');
          err.code = 'ETIMEDOUT';
          throw err;
        }
        assert.equal(options.port, 465);
        assert.equal(options.secure, true);
        assert.equal(options.requireTLS, false);
        assert.equal(options.family, 4);
        assert.equal(options.auth.pass, 'abcd1234efgh5678');
        assert.equal(mail.from, 'sender@gmail.com');
        return { messageId: 'ok-465', accepted: [mail.to], rejected: [] };
      }
    };
  });

  const ctx = loadEmailService({
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: ' "abcd 1234 efgh 5678" ',
    SENDER_EMAIL: 'CampusCert <onboarding@resend.dev>',
    BREVO_API_KEY: undefined,
    RESEND_API_KEY: undefined
  });
  try {
    const res = await ctx.mod.sendEmail({ to: 'user@example.test', subject: 'Hello', text: 'Body' });
    assert.equal(res.delivered, true);
    assert.equal(res.email_id, 'ok-465');
    assert.deepEqual(calls.map(c => c.port), [587, 465]);
  } finally {
    ctx.restore();
  }
});

test('Nodemailer auth failure (535/EAUTH) reports actionable error without retrying port 465', async t => {
  const ports = [];
  t.mock.method(nodemailer, 'createTransport', options => {
    ports.push(options.port);
    return {
      close() {},
      sendMail: async () => {
        const err = new Error('Invalid login: 535-5.7.8 Username and Password not accepted');
        err.code = 'EAUTH';
        err.responseCode = 535;
        throw err;
      }
    };
  });

  const ctx = loadEmailService({
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'wrongpass',
    BREVO_API_KEY: 'unused-if-auth-failed',
    RESEND_API_KEY: undefined
  });
  try {
    const res = await ctx.mod.sendEmail({ to: 'user@example.test', subject: 'Hello', text: 'Body' });
    assert.equal(res.delivered, false);
    assert.match(res.error, /535\/EAUTH/);
    assert.deepEqual(ports, [587]);
  } finally {
    ctx.restore();
  }
});

test('Nodemailer falls back to Brevo HTTPS API when SMTP ports 587 and 465 are blocked', async t => {
  t.mock.method(nodemailer, 'createTransport', () => ({
    close() {},
    sendMail: async () => {
      const err = new Error('Connection timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }
  }));

  let fetchUrl;
  let fetchPayload;
  t.mock.method(global, 'fetch', async (url, init) => {
    fetchUrl = url;
    fetchPayload = JSON.parse(init.body);
    return Response.json({ messageId: '<brevo-123>' });
  });

  const ctx = loadEmailService({
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'abcdefghijklmnop',
    SENDER_EMAIL: 'CampusCert Admin <sender@gmail.com>',
    BREVO_API_KEY: 'xkeysib-test-key',
    RESEND_API_KEY: undefined
  });
  try {
    const res = await ctx.mod.sendEmail({
      to: 'student@example.test',
      subject: 'Cert',
      html: '<p>Hi</p>',
      attachments: [{ filename: 'cert.pdf', content: Buffer.from('PDF') }]
    });
    assert.equal(res.delivered, true);
    assert.equal(res.provider, 'brevo');
    assert.equal(res.email_id, '<brevo-123>');
    assert.equal(fetchUrl, 'https://api.brevo.com/v3/smtp/email');
    assert.deepEqual(fetchPayload.sender, { name: 'CampusCert Admin', email: 'sender@gmail.com' });
    assert.equal(fetchPayload.attachment[0].content, Buffer.from('PDF').toString('base64'));
  } finally {
    ctx.restore();
  }
});

test('Nodemailer falls back to Resend HTTPS API only when RESEND_SENDER_EMAIL is configured', async t => {
  t.mock.method(nodemailer, 'createTransport', () => ({
    close() {},
    sendMail: async () => {
      const err = new Error('Connection timeout');
      err.code = 'ETIMEDOUT';
      throw err;
    }
  }));
  t.mock.method(require('../services/workload'), 'withSlot', async (_kind, task) => task());

  let sentFrom;
  t.mock.method(global, 'fetch', async (_url, init) => {
    const body = JSON.parse(init.body);
    sentFrom = body.from;
    return Response.json({ id: 'resend-fallback-1' });
  });

  const withoutVerifiedSender = loadEmailService({
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'abcdefghijklmnop',
    SENDER_EMAIL: 'CampusCert Admin <sender@gmail.com>',
    RESEND_API_KEY: 're_test_key',
    RESEND_SENDER_EMAIL: undefined,
    RESEND_TEST_MODE: undefined,
    BREVO_API_KEY: undefined
  });
  try {
    const res1 = await withoutVerifiedSender.mod.sendEmail({ to: 'student@example.test', subject: 'Hi', text: 'Body' });
    assert.equal(res1.delivered, false);
    assert.match(res1.error, /Render Free Tier block outbound SMTP ports/);
  } finally {
    withoutVerifiedSender.restore();
  }

  const withVerifiedSender = loadEmailService({
    EMAIL_PROVIDER: 'nodemailer',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '587',
    SMTP_USER: 'sender@gmail.com',
    SMTP_PASS: 'abcdefghijklmnop',
    SENDER_EMAIL: 'CampusCert Admin <sender@gmail.com>',
    RESEND_API_KEY: 're_test_key',
    RESEND_SENDER_EMAIL: 'CampusCert <noreply@campuscert.example>',
    BREVO_API_KEY: undefined
  });
  try {
    const res2 = await withVerifiedSender.mod.sendEmail({ to: 'student@example.test', subject: 'Hi', text: 'Body' });
    assert.equal(res2.delivered, true);
    assert.equal(res2.provider, 'resend');
    assert.equal(sentFrom, 'CampusCert <noreply@campuscert.example>');
  } finally {
    withVerifiedSender.restore();
  }
});
