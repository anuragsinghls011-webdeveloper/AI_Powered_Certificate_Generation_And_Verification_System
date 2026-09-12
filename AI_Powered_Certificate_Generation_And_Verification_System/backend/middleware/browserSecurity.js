const cors = require('cors');
const { doubleCsrf } = require('csrf-csrf');
const { createHash } = require('crypto');
const config = require('../config/security');
const { verifyAccessToken } = require('../utils/tokens');

const cookieOptions = { httpOnly: true, secure: true, sameSite: 'none', path: '/' };
const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => config.csrfSecret,
  getSessionIdentifier: req => createHash('sha256').update(req.cookies?.access_token || 'anonymous').digest('hex'),
  cookieName: '__Host-campuscert-csrf', cookieOptions,
  errorConfig: { statusCode: 403, message: 'Security token is missing or expired.', code: 'CSRF_INVALID' }
});
const allowed = origin => typeof origin === 'string' && config.origins.includes(origin);

function originGuard(req, res, next) {
  if (Object.keys(req.query).some(key => /[\[\]]/.test(key))) return res.status(400).json({ error: 'Nested query parameters are not supported' });
  if (req.headers.origin && !allowed(req.headers.origin)) return res.status(403).json({ error: 'Origin not allowed', code: 'ORIGIN_DENIED' });
  next();
}
const corsPolicy = cors({
  origin: (origin, cb) => cb(null, allowed(origin)), credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Organization-ID', 'Idempotency-Key'],
  exposedHeaders: ['Content-Disposition', 'Retry-After']
});
function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const cookieAuth = Boolean(req.cookies?.access_token || req.cookies?.refresh_token);
  // Only cryptographically valid, cookie-free bearer requests may bypass browser CSRF.
  if (!cookieAuth && !req.headers.origin && req.headers.authorization?.startsWith('Bearer ')) {
    try { verifyAccessToken(req.headers.authorization.slice(7)); return next(); }
    catch { return res.status(401).json({ error: 'Invalid or expired token' }); }
  }
  if (!allowed(req.headers.origin)) return res.status(403).json({ error: 'Trusted Origin required', code: 'ORIGIN_DENIED' });
  doubleCsrfProtection(req, res, err => err
    ? res.status(403).json({ error: 'Security token is missing or expired.', code: 'CSRF_INVALID' }) : next());
}
function csrfToken(req, res) {
  res.set('Cache-Control', 'no-store');
  res.json({ csrf_token: generateCsrfToken(req, res) });
}
module.exports = { originGuard, corsPolicy, csrfGuard, csrfToken };