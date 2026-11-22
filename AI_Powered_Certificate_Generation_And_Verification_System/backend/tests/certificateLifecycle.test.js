const test = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_URL ||= 'http://localhost:3000';
process.env.JWT_SECRET ||= 'test-only-secret';
process.env.CERT_STORAGE_DIR ||= '/tmp/campuscert-test';
for (const name of [
  'API_JSON_BYTES', 'TEMPLATE_JSON_BYTES', 'BULK_MAX_FILE_SIZE', 'BULK_MAX_ROWS',
  'BULK_MAX_COLS', 'BULK_EXPANDED_BYTES', 'BULK_PAYLOAD_BYTES', 'TEMPLATE_MAX_FIELDS',
  'IMAGE_MAX_BYTES', 'IMAGE_MAX_PIXELS', 'WORKER_MEMORY_MB', 'WORK_TIMEOUT_MS',
  'WORK_CONCURRENCY', 'JOB_WORKERS', 'JOB_QUEUE_LIMIT', 'JOB_MAX_ATTEMPTS',
  'JOB_LEASE_MS', 'JOB_POLL_MS', 'WORK_RATE_WINDOW_SECONDS', 'WORK_RATE_LIMIT',
  'REPORT_MAX_ROWS'
]) process.env[name] ||= '100';

const dbModule = require('../config/db');
const document = { cert_id: 'CERT-2026-ABCDEF0123456789', organization_id: 'org-a', status: 'Active' };
const audit = [];
let lastFilter;
const lookups = [];
dbModule.getCertificatesCol = () => ({
  findOne: async filter => {
    lookups.push(filter);
    return filter.cert_id === document.cert_id &&
      (!filter.organization_id || filter.organization_id === document.organization_id) ? { ...document } : null;
  },
  updateOne: async (filter, update) => {
    lastFilter = filter;
    if (filter.organization_id !== document.organization_id || document.status === 'Revoked') return { modifiedCount: 0 };
    Object.assign(document, update.$set);
    return { modifiedCount: 1 };
  },
  updateMany: async (filter, update) => {
    lastFilter = filter;
    if (filter.organization_id !== document.organization_id || document.status === 'Revoked' ||
        !filter.cert_id.$in.includes(document.cert_id)) return { modifiedCount: 0 };
    Object.assign(document, update.$set);
    return { modifiedCount: 1 };
  }
});
dbModule.getDB = () => ({ collection: name => name === 'organizations'
  ? { findOne: async () => ({ name: 'Test Organization' }) }
  : name === 'work_rates'
    ? { findOneAndUpdate: async () => ({ count: 1 }) }
    : { insertOne: async entry => { audit.push(entry); } } });

const { revokeCertificate, revokeBulkCertificates } = require('../controllers/certificateController');
const { deliverCertificate } = require('../services/certificateEmailService');
const { csvCell } = require('../modules/bulkGeneration/routes');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
const request = () => ({
  organization: { id: 'org-a' }, user: { id: 'admin-a' },
  params: { cert_id: document.cert_id }, body: {}, query: {}
});

test('revocation retains certificate, scopes update, and is idempotent', async () => {
  const res = response();
  await revokeCertificate(request(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(document.status, 'Revoked');
  assert.equal(document.revoked_by, 'admin-a');
  assert.equal(lastFilter.organization_id, 'org-a');
  assert.equal(audit.length, 1);

  await revokeCertificate(request(), response());
  assert.equal(audit.length, 1);
});

test('bulk revocation rejects operator shaped IDs before database mutation', async () => {
  const req = request();
  req.body = { cert_ids: [{ $ne: null }] };
  const res = response();
  await revokeBulkCertificates(req, res);
  assert.equal(res.statusCode, 400);
});

test('revoked certificate cannot be delivered by a queued email worker', async () => {
  const result = await deliverCertificate({ cert: { ...document, recipient_email: 'test@example.com' } });
  assert.equal(result.delivered, false);
  assert.equal(result.skipped, true);
});

test('CSV export quotes multiline values and neutralizes spreadsheet formulas', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"');
  assert.equal(csvCell('Alice,\nBob'), '"Alice,\nBob"');
});

test('public verification shows revoked status and refuses PDF download', async () => {
  const express = require('express');
  const app = express();
  app.use('/api/verify', require('../routes/verifyRoutes'));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/verify/${document.cert_id}`;
    const verification = await fetch(base);
    assert.equal(verification.status, 200, `${await verification.clone().text()} ${JSON.stringify(lookups)}`);
    assert.equal((await verification.json()).status, 'Revoked');
    const pdf = await fetch(`${base}/download-pdf`);
    assert.equal(pdf.status, 409);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
