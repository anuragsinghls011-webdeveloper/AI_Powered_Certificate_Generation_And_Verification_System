const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

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

// --- Global Middleware ---
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// --- API Routes ---
const authMw = require('./middleware/authMiddleware');

app.use('/api/auth', authRoutes);
app.use('/api/events', authMw.authenticateUser(), eventRoutes);
app.use('/api/templates', authMw.authenticateUser(), templateRoutes);
app.use('/api/certificates', authMw.authenticateUser(), certificateRoutes);
app.use('/api/analytics', authMw.authenticateUser(), analyticsRoutes);

// --- Error Handler (must be last) ---
app.use(errorHandler);

/**
 * Mounts the bulk generation module routes.
 * Called after DB connection is established since bulk routes need the db instance.
 */
function mountBulkRoutes(db) {
  const authMw = require('./middleware/authMiddleware');
  app.use('/api/bulk', authMw.authenticateUser(), bulkModule.build(db));
}

module.exports = { app, mountBulkRoutes };
