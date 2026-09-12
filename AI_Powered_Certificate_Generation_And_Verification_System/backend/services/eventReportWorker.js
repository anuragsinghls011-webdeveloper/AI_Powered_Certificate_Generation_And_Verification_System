const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const limits = require('../config/security');

// XLSX serialization is CPU-bound: keep it off Express's request loop.
if (!isMainThread) {
  try {
    const buffer = require('./eventReportService').buildReport(workerData);
    const bytes = Uint8Array.from(buffer);
    parentPort.postMessage({ bytes }, [bytes.buffer]);
  } catch (error) {
    parentPort.postMessage({ error: error.status === 422 ? error.message : 'Unable to generate the event report. Please try again.', status: error.status || 500 });
  }
}

let activeWorkers = 0;
function isolatedReport(data, signal) {
  if (activeWorkers >= 2) return Promise.reject(Object.assign(new Error('busy'), {
    status: 429, publicMessage: 'Reports are busy right now. Please try again shortly.'
  }));
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Download cancelled'));
    const worker = new Worker(__filename, { workerData: data, resourceLimits: { maxOldGenerationSizeMb: limits.workerMemory } });
    activeWorkers++;
    let settled = false;
    const finish = (error, bytes) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate().finally(() => { activeWorkers--; });
      error ? reject(error) : resolve(bytes);
    };
    const abort = () => finish(new Error('Download cancelled'));
    const timer = setTimeout(() => finish(Object.assign(new Error('timeout'), {
      status: 503, publicMessage: 'Report generation took too long. Please try again.'
    })), limits.workTimeout);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', message => message.error
      ? finish(Object.assign(new Error(message.error), { status: message.status, publicMessage: message.error }))
      : finish(null, message.bytes));
    worker.once('error', finish);
    worker.once('exit', code => { if (!settled) finish(new Error(`Report worker exited (${code})`)); });
  });
}

const runReportWorker = (data, signal) => require('./workload').withSlot('report', () => isolatedReport(data, signal));
module.exports = { runReportWorker };