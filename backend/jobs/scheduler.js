const store = require('./jobStore');
const { emit } = require('./jobManager');
const logger = require('../lib/logger');

let runJobImpl = null;
let currentJobId = null;
let currentAbort = null;
let busy = false;

// Cool-down between Airbnb-heavy jobs: a queue of many host dossiers (e.g.
// every host behind an AL Registry import) must not hit Airbnb back to back.
// A random pause after each such job; kicks during it are deferred.
const HEAVY_TYPES = new Set(['host', 'host-sync', 'al-registry', 'al-google']);
let cooldownUntil = 0;
let cooldownTimer = null;

function cooldownMs() {
  const min = parseInt(process.env.JOB_COOLDOWN_MIN_S || '120', 10);
  const max = Math.max(min, parseInt(process.env.JOB_COOLDOWN_MAX_S || '300', 10));
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

function setRunner(fn) {
  runJobImpl = fn;
}

function kick() {
  if (busy) return;
  const wait = cooldownUntil - Date.now();
  if (wait > 0) {
    if (!cooldownTimer) {
      cooldownTimer = setTimeout(() => {
        cooldownTimer = null;
        kick();
      }, wait);
    }
    return;
  }
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
      if (HEAVY_TYPES.has(next.type)) {
        const ms = cooldownMs();
        cooldownUntil = Date.now() + ms;
        if (store.getNextQueued()) logger.info(`scheduler: cooling down ${Math.round(ms / 1000)}s before the next job`);
      }
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
