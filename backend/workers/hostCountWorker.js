// Run one tracker count-check job (type 'host-count'): read the declared
// listing count from the host profile page and append a host_snapshots row.
// Goes through the same serial queue as full jobs, so a check never runs
// Playwright concurrently with a host analysis.

const { launchContext } = require('../scraper/browser');
const { scrapeHostCount } = require('../scraper/hostCount');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const COUNT_CHECK_TIMEOUT_MS = 3 * 60 * 1000;

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function runHostCountJob(job, { signal }) {
  const profileUrl = job.urls[0];
  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  if (!idMatch) {
    logger.error(`host-count job ${job.id}: cannot derive host id from ${profileUrl}`);
    return { cancelled: false, errored: true };
  }
  const hostId = idMatch[1];

  let session = null;
  let result;
  try {
    session = await launchContext(0);
    const page = await session.context.newPage();
    result = await withTimeout(
      scrapeHostCount(page, profileUrl, signal),
      COUNT_CHECK_TIMEOUT_MS,
      'host count check'
    );
    await page.close().catch(() => {});
  } catch (err) {
    if (signal?.aborted) return { cancelled: true, errored: false };
    logger.error(`host-count check failed for ${profileUrl}`, err);
    return { cancelled: false, errored: true };
  } finally {
    if (session) await session.close().catch(() => {});
  }

  store.touchTrackedHost(hostId);

  // A missed regex must never write a poisoned zero — mark the check errored
  // and let the next tick retry naturally.
  if (!Number.isFinite(result.listingsCount) || result.listingsCount <= 0) {
    logger.warn(`host-count check for ${profileUrl}: no declared count found`);
    return { cancelled: false, errored: true };
  }

  const ts = Math.floor(Date.now() / 1000);
  store.insertHostSnapshot({
    hostId,
    listingsCount: result.listingsCount,
    source: 'tracker',
    jobId: job.id,
    ts,
  });
  emit(job.id, 'host-snapshot', {
    jobId: job.id,
    hostId,
    listingsCount: result.listingsCount,
    ts,
  });
  logger.info(`host-count: ${hostId} → ${result.listingsCount} listings`);
  return { cancelled: false, errored: false };
}

module.exports = { runHostCountJob };
