const express = require('express');
const cookieParser = require('cookie-parser');
const config = require('./config/security');
const browser = require('./middleware/browserSecurity');

// Route imports
const authRoutes = require('./routes/authRoutes');
const eventRoutes = require('./routes/eventRoutes');
const templateRoutes = require('./routes/templateRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const bulkModule = require('./modules/bulkGeneration/routes');

// Middleware imports
const errorHandler = require('./middleware/errorHandler');

const app = express();
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 1) {
  throw new Error('TRUST_PROXY_HOPS must be a positive integer');
}
app.set('trust proxy', trustProxyHops);

// --- Global Middleware ---
app.use(browser.originGuard, browser.corsPolicy);
// Design Studio templates embed background/signature/logo images as data URLs.
const smallJson = express.json({ limit: config.jsonBytes });
const templateJson = express.json({ limit: config.templateBytes });
app.use((req, res, next) => (req.path.startsWith('/api/templates') ? templateJson : smallJson)(req, res, next));
app.use(cookieParser());
app.get('/api/auth/csrf', browser.csrfToken);
app.use('/api', browser.csrfGuard);

// --- API Routes ---
const authMw = require('./middleware/authMiddleware');

app.use('/api/auth', authRoutes);
const privateBoundary = [authMw.authenticateUser(), authMw.resolveOrganization()];
app.use('/api/events', ...privateBoundary, eventRoutes);
app.use('/api/templates', ...privateBoundary, templateRoutes);
app.use('/api/certificates', ...privateBoundary, certificateRoutes);
app.use('/api/analytics', ...privateBoundary, authMw.requirePermission('analytics.read'), analyticsRoutes);
app.use('/api/reports', authMw.authenticateUser(), require('./routes/reportRoutes'));

// --- Error Handler (must be last) ---

/**
 * Mounts the bulk generation module routes.
 * Called after DB connection is established since bulk routes need the db instance.
 */
function mountBulkRoutes(db) {
  const authMw = require('./middleware/authMiddleware');
  app.use('/api/bulk', ...privateBoundary, bulkModule.build(db));
  app.use(errorHandler);
}

module.exports = { app, mountBulkRoutes };
