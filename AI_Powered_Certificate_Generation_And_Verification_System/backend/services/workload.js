const { randomUUID, createHash } = require('crypto');
const { getDB } = require('../config/db');
const config = require('../config/security');
const busy = () => Object.assign(new Error('Work capacity reached. Please retry shortly.'), { statusCode: 429 });

async function acquireSlot(kind, count = config.concurrency, leaseMs = config.workTimeout * 2) {
  const col = getDB().collection('work_slots');
  for (let index = 0; index < count; index++) {
    const token = randomUUID();
    const _id = `${kind}:${index}`;
    try {
      const doc = await col.findOneAndUpdate({ _id, until: { $lte: new Date() } },
        { $set: { token, until: new Date(Date.now() + leaseMs) } }, { upsert: true, returnDocument: 'after' });
      if (doc) return {
        token,
        renew: async () => (await col.updateOne({ _id, token, until: { $gt: new Date() } }, { $set: { until: new Date(Date.now() + leaseMs) } })).matchedCount === 1,
        release: () => col.updateOne({ _id, token }, { $set: { until: new Date(0) } })
      };
    } catch (err) { if (err.code !== 11000) throw err; }
  }
  throw busy();
}
async function withSlot(kind, task) {
  const lease = await acquireSlot(kind);
  try { return await task(); } finally { await lease.release(); }
}
function workLimit(kind) {
  return async (req, res, next) => {
    try {
      const window = Math.floor(Date.now() / (config.rateWindow * 1000));
      const identity = `${req.organization?.id || req.ip}:${req.user?.id || ''}:${kind}:${window}`;
      const _id = createHash('sha256').update(identity).digest('hex');
      const col = getDB().collection('work_rates');
      const update = { $inc: { count: 1 }, $setOnInsert: { expires_at: new Date(Date.now() + config.rateWindow * 2000) } };
      let result;
      try { result = await col.findOneAndUpdate({ _id }, update, { upsert: true, returnDocument: 'after' }); }
      catch (err) {
        if (err.code !== 11000) throw err;
        result = await col.findOneAndUpdate({ _id }, { $inc: { count: 1 } }, { returnDocument: 'after' });
      }
      if (result.count > config.rateLimit) {
        res.set('Retry-After', String(config.rateWindow));
        return res.status(429).json({ error: 'Operation rate limit reached. Please retry later.' });
      }
      next();
    } catch (err) { next(err); }
  };
}
async function streamLease(res) {
  const lease = await acquireSlot('zip');
  const timer = setTimeout(() => res.destroy(), config.workTimeout);
  const release = () => { clearTimeout(timer); lease.release().catch(() => {}); };
  res.once('finish', release); res.once('close', release);
}
module.exports = { acquireSlot, withSlot, workLimit, streamLease };