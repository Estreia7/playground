// Registry-only re-scrape (job type 'registry'): re-fetch the RNT record for
// every AL number in a host dossier — without re-running the Playwright
// phases. Fixes stale/polluted registry data (e.g. dirty emails) in minutes.
// Plain HTTP only; runs through the serial queue like every other job.

const { fetchRnt } = require('../lib/rnt');
const { geocodeAddress } = require('../lib/geocode');
const { randomDelay } = require('../lib/delay');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

// Force-refresh one AL: RNT fetch (no cache read), geocode only when coords
// are missing or previously failed, upsert, and emit under the HOST job id so
// an open dossier updates live. Shared with the manual-AL endpoint.
async function refreshOneAl(alNumber, hostJobId, signal) {
  const rnt = await fetchRnt(alNumber, signal);
  const existing = store.alLicenseLookup(alNumber, 36500);
  let lat = existing?.lat ?? null;
  let lng = existing?.lng ?? null;
  let geocodeStatus = existing?.geocodeStatus ?? 'pending';
  if (rnt.status === 'found' && (lat == null || geocodeStatus === 'failed')) {
    const geo = await geocodeAddress(rnt.address, signal);
    lat = geo.lat;
    lng = geo.lng;
    geocodeStatus = geo.precision || 'failed';
  }
  if (rnt.status !== 'found') geocodeStatus = 'skipped';
  store.alLicenseUpsert({ alNumber, rnt, lat, lng, geocodeStatus });
  emit(hostJobId, 'host-license-done', {
    jobId: hostJobId,
    alNumber: String(alNumber),
    rnt,
    lat,
    lng,
    geocodeStatus,
    cached: false,
  });
  return { rnt, lat, lng, geocodeStatus };
}

async function runRegistryJob(job, { signal }) {
  const hostJobId = job.urls[0];
  const listings = store.hostListingResults(hostJobId);
  const alNumbers = [...new Set(listings.map((l) => l.alNumber).filter(Boolean).map(String))];
  if (alNumbers.length === 0) {
    logger.warn(`registry job ${job.id}: host ${hostJobId} has no AL numbers`);
    return { cancelled: false, errored: true };
  }

  let failures = 0;
  for (const alNumber of alNumbers) {
    if (signal?.aborted) return { cancelled: true, errored: false };
    try {
      await refreshOneAl(alNumber, hostJobId, signal);
    } catch (err) {
      if (signal?.aborted) return { cancelled: true, errored: false };
      failures += 1;
      logger.warn(`registry refresh failed for AL ${alNumber}:`, err.message);
      emit(hostJobId, 'host-license-done', {
        jobId: hostJobId,
        alNumber: String(alNumber),
        error: err.message,
      });
    }
    await randomDelay(400, 800, signal).catch(() => {});
  }
  logger.info(
    `registry job ${job.id}: refreshed ${alNumbers.length - failures}/${alNumbers.length} licenses for ${hostJobId}`
  );
  return { cancelled: false, errored: failures === alNumbers.length };
}

module.exports = { runRegistryJob, refreshOneAl };
