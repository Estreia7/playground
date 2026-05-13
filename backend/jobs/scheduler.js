const store = require('./jobStore');
const { emit } = require('./jobManager');
const logger = require('../lib/logger');

let runJobImpl = null;
let currentJobId = null;
let currentAbort = null;
let busy = false;

function setRunner(fn) {
  runJobImpl = fn;
}

function kick() {
  if (busy) return;
  if (!runJobImpl) {
    logger.warn('scheduler.kick called before runner was registered');
    return;
  }
  const next = store.getNextQueued();
  if (!next) return;

  busy = true;
  currentJobId = next.id;
  currentAbort = new AbortController();

  store.markRunning(next.id);
  emit(next.id, 'job-status', { jobId: next.id, status: 'running' });

  runJobImpl(next, { signal: currentAbort.signal })
    .then((result) => {
      const status = result?.cancelled ? 'cancelled' : result?.errored ? 'error' : 'done';
      store.markTerminal(next.id, status);
      emit(next.id, 'job-status', { jobId: next.id, status });
    })
    .catch((err) => {
      logger.error('scheduler runner threw', err);
      store.markTerminal(next.id, 'error');
      emit(next.id, 'job-status', { jobId: next.id, status: 'error', error: String(err) });
    })
    .finally(() => {
      busy = false;
      currentJobId = null;
      currentAbort = null;
      setImmediate(kick);
    });
}

function cancel(jobId) {
  const job = store.getJob(jobId);
  if (!job) return { ok: false, reason: 'not-found' };

  if (job.status === 'queued') {
    store.markTerminal(jobId, 'cancelled');
    emit(jobId, 'job-status', { jobId, status: 'cancelled' });
    return { ok: true };
  }
  if (job.status === 'running' && currentJobId === jobId && currentAbort) {
    currentAbort.abort();
    return { ok: true };
  }
  return { ok: false, reason: 'not-cancellable' };
}

function isRunning(jobId) {
  return currentJobId === jobId;
}

module.exports = { setRunner, kick, cancel, isRunning };
