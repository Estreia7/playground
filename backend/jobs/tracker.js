// Tracker bot: periodically re-check the declared listing count of every
// tracked host ("View all N listings") so portfolio evolution can be charted.
//
// A tick runs hourly (TRACKER_TICK_MS) and enqueues a lightweight
// 'host-count' job for each enabled host whose latest snapshot is older than
// TRACKER_PERIOD_HOURS (default 48h). Checks flow through the serial job
// queue, so they never overlap a running analysis; the "older than" condition
// self-heals missed windows after downtime. Only runs while this process is
// up — keep the backend under pm2/systemd for continuous tracking.

const { nanoid } = require('nanoid');
const store = require('./jobStore');
const scheduler = require('./scheduler');
const { emit } = require('./jobManager');
const logger = require('../lib/logger');

const TICK_MS = parseInt(process.env.TRACKER_TICK_MS || String(60 * 60 * 1000), 10);
const PERIOD_S = Math.round(parseFloat(process.env.TRACKER_PERIOD_HOURS || '48') * 3600);
// Blocking-risk ceiling: spread a large backlog over several ticks.
const MAX_ENQUEUES_PER_TICK = parseInt(process.env.TRACKER_MAX_PER_TICK || '10', 10);

function tick({ force = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const due = store
    .listTrackedHosts()
    .filter((h) => h.enabled)
    .filter((h) => force || !h.latestTs || now - h.latestTs >= PERIOD_S)
    .filter((h) => !store.hasActiveJobForUrl(h.hostUrl, 'host-count'))
    // Shuffle so checks never hit Airbnb in a fixed order.
    .map((h) => ({ h, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map(({ h }) => h)
    .slice(0, MAX_ENQUEUES_PER_TICK);

  const enqueued = [];
  for (const host of due) {
    const id = nanoid(10);
    store.createJob({
      id,
      urls: [host.hostUrl],
      name: `Tracker — ${host.hostName || host.hostId}`,
      type: 'host-count',
    });
    emit(id, 'job-created', { jobId: id, type: 'host-count' });
    enqueued.push({ jobId: id, hostId: host.hostId });
  }
  if (enqueued.length > 0) {
    logger.info(`tracker: enqueued ${enqueued.length} count check(s)`);
    scheduler.kick();
  }
  return { enqueued };
}

function start() {
  setInterval(() => tick(), TICK_MS).unref();
  // Delayed initial tick so boot recovery + queue drain settle first.
  setTimeout(() => tick(), 60_000).unref();
  logger.info(
    `tracker: started (tick ${Math.round(TICK_MS / 1000)}s, period ${Math.round(PERIOD_S / 3600)}h)`
  );
}

module.exports = { start, tick };
