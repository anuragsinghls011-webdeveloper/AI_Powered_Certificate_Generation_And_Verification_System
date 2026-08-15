const express = require('express');
const cors = require('cors');

// Route imports
const eventRoutes = require('./routes/eventRoutes');
const templateRoutes = require('./routes/templateRoutes');
const certificateRoutes = require('./routes/certificateRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const bulkModule = require('./modules/bulkGeneration/routes');

// Middleware imports
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --- Global Middleware ---
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- API Routes ---
app.use('/api/events', eventRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/analytics', analyticsRoutes);

// --- Error Handler (must be last) ---
app.use(errorHandler);

/**
 * Mounts the bulk generation module routes.
 * Called after DB connection is established since bulk routes need the db instance.
 */
function mountBulkRoutes(db) {
  app.use('/api/bulk', bulkModule.build(db));
}

module.exports = { app, mountBulkRoutes };
