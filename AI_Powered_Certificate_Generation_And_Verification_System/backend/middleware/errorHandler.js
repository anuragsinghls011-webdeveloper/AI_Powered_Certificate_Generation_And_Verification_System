/**
 * Centralized Express error-handling middleware.
 * Must be registered after all route handlers.
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err.message || err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({ error: message });
}

module.exports = errorHandler;
