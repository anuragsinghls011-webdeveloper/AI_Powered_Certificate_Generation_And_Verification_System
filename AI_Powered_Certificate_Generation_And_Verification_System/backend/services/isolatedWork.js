const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const config = require('../config/security');

if (!isMainThread) {
  (async () => {
    const result = workerData.kind === 'parse'
      ? await require('../modules/bulkGeneration/spreadsheetParser').parseUpload(Buffer.from(workerData.buffer), workerData.name)
      : await require('../modules/bulkGeneration/certificateRenderer').renderCertificatePdfBuffer(workerData.template, workerData.values);
    parentPort.postMessage({ result });
  })().catch(() => parentPort.postMessage({ error: 'Unable to process content within the configured limits.' }));
}
async function runIsolated(kind, payload) {
  return require('./workload').withSlot(kind, () => new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { kind, ...payload }, resourceLimits: { maxOldGenerationSizeMb: config.workerMemory } });
    let settled = false;
    const end = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate().then(() => error ? reject(error) : resolve(value), reject);
    };
    const timer = setTimeout(() => end(Object.assign(new Error('Processing limit exceeded'), { statusCode: 413 })), config.workTimeout);
    worker.once('message', message => end(message.error ? Object.assign(new Error(message.error), { statusCode: 422 }) : null,
      kind === 'pdf' ? Buffer.from(message.result || []) : message.result));
    worker.once('error', () => end(Object.assign(new Error('Processing limit exceeded'), { statusCode: 422 })));
    worker.once('exit', () => { if (!settled) end(new Error('Processing interrupted')); });
  }));
}
module.exports = { runIsolated };