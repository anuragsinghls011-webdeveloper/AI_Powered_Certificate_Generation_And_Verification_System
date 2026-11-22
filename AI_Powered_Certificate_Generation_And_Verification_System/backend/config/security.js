const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const integer = name => {
  const value = Number(required(name));
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
};
const isProd = process.env.NODE_ENV === 'production';
const appUrl = required('APP_URL');
const appOrigin = new URL(appUrl).origin;
const frontendOrigin = process.env.FRONTEND_URL ? new URL(process.env.FRONTEND_URL).origin : null;
const envOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
// The production web app is served from this fixed Vercel origin.
const deployedFrontendOrigins = ['https://ai-powered-certificate-generation-a.vercel.app'];
const devOrigins = isProd ? [] : ['http://localhost:3000', 'http://127.0.0.1:3000'];
const origins = Array.from(new Set([
  ...envOrigins, ...deployedFrontendOrigins, appOrigin,
  ...(frontendOrigin ? [frontendOrigin] : []), ...devOrigins
]));
for (const origin of origins) {
  const parsed = new URL(origin);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }
  if (isProd && parsed.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error(`Insecure CORS origin not allowed in production: ${origin}`);
  }
}
const rawPreviewRegex = (process.env.CORS_PREVIEW_ORIGIN_REGEX || '').trim();
const previewOriginRegex = rawPreviewRegex ? new RegExp(rawPreviewRegex) : null;
module.exports = Object.freeze({
  origins,
  originSet: new Set(origins),
  previewOriginRegex,
  csrfSecret: required('JWT_SECRET'),
  appUrl,
  jsonBytes: integer('API_JSON_BYTES'), templateBytes: integer('TEMPLATE_JSON_BYTES'),
  uploadBytes: integer('BULK_MAX_FILE_SIZE'), rows: integer('BULK_MAX_ROWS'), columns: integer('BULK_MAX_COLS'),
  expandedBytes: integer('BULK_EXPANDED_BYTES'), payloadBytes: integer('BULK_PAYLOAD_BYTES'),
  templateFields: integer('TEMPLATE_MAX_FIELDS'), imageBytes: integer('IMAGE_MAX_BYTES'), imagePixels: integer('IMAGE_MAX_PIXELS'),
  workerMemory: integer('WORKER_MEMORY_MB'), workTimeout: integer('WORK_TIMEOUT_MS'),
  concurrency: integer('WORK_CONCURRENCY'), jobWorkers: integer('JOB_WORKERS'),
  queueLimit: integer('JOB_QUEUE_LIMIT'), jobAttempts: integer('JOB_MAX_ATTEMPTS'),
  leaseMs: integer('JOB_LEASE_MS'), pollMs: integer('JOB_POLL_MS'),
  rateWindow: integer('WORK_RATE_WINDOW_SECONDS'), rateLimit: integer('WORK_RATE_LIMIT'),
  reportRows: integer('REPORT_MAX_ROWS'), certDir: required('CERT_STORAGE_DIR')
});
