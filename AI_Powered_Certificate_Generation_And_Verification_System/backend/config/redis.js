/**
 * Redis connection singleton for BullMQ queues and workers.
 *
 * BullMQ requires separate ioredis connections for Queue (client) and Worker
 * (subscriber). This module exposes a factory that creates correctly configured
 * connections, plus a shared connection reference for queue producers.
 *
 * Environment:
 *   REDIS_URL  — full Redis/Valkey URI (default: redis://127.0.0.1:6379)
 */
const IORedis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/** Default ioredis options shared by every connection. */
const baseOptions = {
  maxRetriesPerRequest: null,   // Required by BullMQ — it handles retries itself
  enableReadyCheck: true,
  retryStrategy(times) {
    // Exponential backoff: 500ms, 1s, 2s, … capped at 15s
    return Math.min(times * 500, 15000);
  },
  reconnectOnError(err) {
    // Auto-reconnect on READONLY errors (e.g. failover)
    return err.message.includes('READONLY');
  }
};

/**
 * Creates a new ioredis connection.
 * BullMQ needs a *separate* connection per Worker (subscriber mode).
 * Call this from worker files; do NOT share a single connection across workers.
 */
function createRedisConnection() {
  return new IORedis(REDIS_URL, { ...baseOptions });
}

/** Shared connection for Queue producers (non-subscriber). */
let _sharedConnection = null;
function getSharedConnection() {
  if (!_sharedConnection) {
    _sharedConnection = new IORedis(REDIS_URL, { ...baseOptions });
    _sharedConnection.on('error', err => {
      console.error('[Redis] Connection error:', err.message);
    });
    _sharedConnection.on('connect', () => {
      console.log('[Redis] Connected to', REDIS_URL.replace(/\/\/.*@/, '//***@'));
    });
  }
  return _sharedConnection;
}

/**
 * Health check — resolves true if Redis responds to PING.
 */
let _isRedisAvailable = null;

async function redisHealthCheck() {
  if (_sharedConnection && _sharedConnection.status === 'ready') return true;
  if (_isRedisAvailable === false) return false; // Cache failure so we don't keep checking and hanging

  return new Promise((resolve) => {
    const checkConn = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Do not retry
      connectTimeout: 2000 // 2 seconds timeout
    });

    checkConn.on('error', () => {
      checkConn.disconnect();
      _isRedisAvailable = false;
      resolve(false);
    });

    checkConn.on('ready', () => {
      checkConn.disconnect();
      _isRedisAvailable = true;
      resolve(true);
    });
  });
}

/**
 * Graceful shutdown — close all known connections.
 */
async function closeRedis() {
  if (_sharedConnection) {
    await _sharedConnection.quit().catch(() => {});
    _sharedConnection = null;
  }
}

module.exports = {
  createRedisConnection,
  getSharedConnection,
  redisHealthCheck,
  closeRedis,
  REDIS_URL
};
