const store = require('./jobStore');
const { emit } = require('./jobManager');
const logger = require('../lib/logger');

let runJobImpl = null;
let currentJobId = null;
let currentAbort = null;
let busy = false;

// Cool-down between Airbnb-heavy jobs: a queue of many host dossiers (e.g.
// every host behind an AL Registry import) must not hit Airbnb back to back.
// The pause scales with the pages the job just visited (~10 s each, 30 s to
// 5 min, ±20 % jitter): a 2-listing host waits 30 s, a big one the full 5 min.
// Kicks during a cool-down are deferred.
const HEAVY_TYPES = new Set(['host', 'host-sync', 'al-registry', 'al-google']);
let cooldownUntil = 0;
let cooldownTimer = null;

function cooldownMs(job) {
  const min = parseInt(process.env.JOB_COOLDOWN_MIN_S || '30', 10);
  const max = Math.max(min, parseInt(process.env.JOB_COOLDOWN_MAX_S || '300', 10));
  const perItem = parseFloat(process.env.JOB_COOLDOWN_PER_ITEM_S || '10');
  let items = 1;
  try {
    items = store.jobWorkItems(job);
  } catch {
    /* fall back to the minimum */
  }
  const base = Math.min(max, Math.max(min, items * perItem));
  return Math.round(base * (0.8 + Math.random() * 0.4) * 1000);
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
        const ms = cooldownMs(next);
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

// Snapshot for status panels: what runs now and how long the cool-down lasts.
function status() {
  return {
    busy,
    currentJobId,
    cooldownUntil: cooldownUntil > Date.now() ? Math.floor(cooldownUntil / 1000) : null,
  };
}

function isRunning(jobId) {
  return currentJobId === jobId;
}

module.exports = { setRunner, kick, cancel, isRunning, status };
