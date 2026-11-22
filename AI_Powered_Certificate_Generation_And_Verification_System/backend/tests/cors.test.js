const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'production';
process.env.APP_URL = 'https://ai-powered-certificate-generation-and.onrender.com';
process.env.JWT_SECRET ||= 'cors-test-only-secret';
process.env.CERT_STORAGE_DIR ||= '/tmp/campuscert-test';
for (const name of [
  'API_JSON_BYTES', 'TEMPLATE_JSON_BYTES', 'BULK_MAX_FILE_SIZE', 'BULK_MAX_ROWS',
  'BULK_MAX_COLS', 'BULK_EXPANDED_BYTES', 'BULK_PAYLOAD_BYTES', 'TEMPLATE_MAX_FIELDS',
  'IMAGE_MAX_BYTES', 'IMAGE_MAX_PIXELS', 'WORKER_MEMORY_MB', 'WORK_TIMEOUT_MS',
  'WORK_CONCURRENCY', 'JOB_WORKERS', 'JOB_QUEUE_LIMIT', 'JOB_MAX_ATTEMPTS',
  'JOB_LEASE_MS', 'JOB_POLL_MS', 'WORK_RATE_WINDOW_SECONDS', 'WORK_RATE_LIMIT',
  'REPORT_MAX_ROWS'
]) process.env[name] ||= '100';

const express = require('express');
const { originGuard, corsPolicy } = require('../middleware/browserSecurity');
const frontendOrigin = 'https://ai-powered-certificate-generation-a.vercel.app';

test('deployed Vercel frontend passes login preflight while unknown origins stay blocked', async () => {
  const app = express();
  app.use(originGuard, corsPolicy);
  app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;
    const preflight = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        Origin: frontendOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), frontendOrigin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');

    const denied = await fetch(url, {
      method: 'OPTIONS',
      headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
