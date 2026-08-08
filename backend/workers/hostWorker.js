// Run one host-analyzer job in phases:
//   1. profile  — Playwright: host identity + listing discovery.
//   2. listings — Playwright pool (≤ WORKER_POOL_SIZE): per-listing meta,
//                 AL license number, photos.
//   3. licenses — plain HTTP (browsers closed): RNT registry + geocoding,
//                 cached in al_licenses so repeat hosts are instant.
// Every phase streams SSE events through the shared jobManager bus.

const { launchContext } = require('../scraper/browser');
const { scrapeHostProfile } = require('../scraper/hostProfile');
const { extractMeta } = require('../scraper/extractMeta');
const { extractLicense } = require('../scraper/extractLicense');
const { extractPhotos } = require('../scraper/extractPhotos');
const { fetchRnt } = require('../lib/rnt');
const { geocodeAddress } = require('../lib/geocode');
const { randomDelay } = require('../lib/delay');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const PER_LISTING_TIMEOUT_MS = 4 * 60 * 1000;
// Generous: discovering a 300-listing portfolio needs ~25 Show-more clicks
// plus scroll rounds before the per-listing phase even starts.
const PROFILE_PHASE_TIMEOUT_MS = 20 * 60 * 1000;

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function runHostJob(job, { signal }) {
  const jobId = job.id;
  const profileUrl = job.urls[0];
  const maxListings = parseInt(process.env.HOST_MAX_LISTINGS || '300', 10);
  let errored = false;

  // --- Phase 1: host profile ------------------------------------------------
  emit(jobId, 'host-phase', { jobId, phase: 'profile' });

  let profile;
  let session = null;
  try {
    session = await launchContext(0);
    const page = await session.context.newPage();
    // Live discovery counter so the UI shows movement during the (long)
    // profile phase; throttled to one event per change.
    let lastFound = -1;
    const onProgress = (found) => {
      if (found === lastFound) return;
      lastFound = found;
      emit(jobId, 'host-phase', { jobId, phase: 'profile', found });
    };
    // Hard watchdog: a wedged browser must fail the job, not block the queue.
    profile = await withTimeout(
      scrapeHostProfile(page, profileUrl, signal, onProgress),
      PROFILE_PHASE_TIMEOUT_MS,
      'profile phase'
    );
    await page.close().catch(() => {});
  } catch (err) {
    if (signal?.aborted) return { cancelled: true, errored: false };
    logger.error('host profile scrape failed', err);
    emit(jobId, 'host-phase', { jobId, phase: 'profile', error: err.message });
    return { cancelled: false, errored: true };
  } finally {
    if (session) await session.close().catch(() => {});
    session = null;
  }

  const listings = profile.listings.slice(0, maxListings);
  store.upsertHostMeta({
    jobId,
    hostUrl: profile.hostUrl,
    hostId: profile.hostId,
    hostName: profile.hostName,
    listingsCount: profile.listingsCount,
  });
  emit(jobId, 'host-profile-done', {
    jobId,
    host: {
      hostId: profile.hostId,
      hostUrl: profile.hostUrl,
      hostName: profile.hostName,
      listingsCount: profile.listingsCount,
    },
    listings,
    truncated: profile.listings.length > listings.length,
  });

  if (listings.length === 0) {
    emit(jobId, 'host-phase', { jobId, phase: 'listings', error: 'no-listings-found' });
    return { cancelled: false, errored: true };
  }

  // --- Phase 2: per-listing detail (pooled) --------------------------------
  emit(jobId, 'host-phase', { jobId, phase: 'listings' });

  const poolSize = Math.max(1, parseInt(process.env.WORKER_POOL_SIZE || '3', 10));
  const queue = [...listings];
  let cursor = 0;

  function dequeue() {
    if (signal?.aborted) return null;
    if (cursor >= queue.length) return null;
    return queue[cursor++];
  }

  async function listingLoop(workerId) {
    let ctx = null;
    try {
      ctx = await launchContext(workerId);
      while (true) {
        const card = dequeue();
        if (!card) return;
        await processHostListing({ jobId, card, ctx, signal });
      }
    } catch (err) {
      if (!signal?.aborted) {
        errored = true;
        logger.error(`host listing worker ${workerId} died:`, err);
      }
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(poolSize, queue.length); i++) {
    workers.push(listingLoop(i + 1));
  }
  await Promise.all(workers);

  if (signal?.aborted) return { cancelled: true, errored };

  // --- Phase 3: RNT registry + geocode (no browser) ------------------------
  emit(jobId, 'host-phase', { jobId, phase: 'licenses' });

  const results = store.hostListingResults(jobId);
  const alNumbers = Array.from(
    new Set(results.map((r) => r.alNumber).filter(Boolean))
  );
  const rntTtlDays = parseInt(process.env.RNT_CACHE_TTL_DAYS || '30', 10);

  for (const alNumber of alNumbers) {
    if (signal?.aborted) return { cancelled: true, errored };
    try {
      let entry = store.alLicenseLookup(alNumber, rntTtlDays);
      let cached = !!entry;
      if (!entry) {
        const rnt = await fetchRnt(alNumber, signal);
        let lat = null;
        let lng = null;
        let geocodeStatus = 'skipped';
        if (rnt.status === 'found') {
          const geo = await geocodeAddress(rnt.address, signal);
          lat = geo.lat;
          lng = geo.lng;
          geocodeStatus = geo.lat != null ? geo.precision : 'failed';
        }
        store.alLicenseUpsert({ alNumber, rnt, lat, lng, geocodeStatus });
        entry = { alNumber, rnt, lat, lng, geocodeStatus };
      }
      emit(jobId, 'host-license-done', {
        jobId,
        alNumber,
        cached,
        rnt: entry.rnt,
        lat: entry.lat,
        lng: entry.lng,
        geocodeStatus: entry.geocodeStatus,
      });
    } catch (err) {
      if (signal?.aborted) return { cancelled: true, errored };
      errored = true;
      logger.warn(`RNT lookup failed for ${alNumber}:`, err.message);
      emit(jobId, 'host-license-done', { jobId, alNumber, error: err.message });
    }
  }

  return { cancelled: !!signal?.aborted, errored };
}

async function processHostListing({ jobId, card, ctx, signal }) {
  const url = card.url;
  emit(jobId, 'host-listing-started', { jobId, url });

  const deadline = Date.now() + PER_LISTING_TIMEOUT_MS;
  let page = null;
  try {
    page = await ctx.context.newPage();

    // One navigation, three extractions (meta / license / photos).
    let meta = { title: null, reviewsCount: null, reviewsScore: null };
    try {
      meta = await extractMeta(page, url, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`meta failed for ${url}:`, err.message);
    }
    if (Date.now() > deadline) throw new Error('per-listing timeout');

    let license = { alNumber: null, locationText: null };
    try {
      license = await extractLicense(page, url, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`license failed for ${url}:`, err.message);
    }

    let photos = [];
    try {
      photos = await extractPhotos(page, url, signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      logger.warn(`photos failed for ${url}:`, err.message);
    }

    const result = {
      url,
      title: meta.title || card.title || null,
      locationText: license.locationText || card.locationText || null,
      reviewsCount: meta.reviewsCount ?? card.reviewsCount ?? null,
      reviewsScore: meta.reviewsScore ?? card.reviewsScore ?? null,
      alNumber: license.alNumber,
      photos,
    };
    store.saveHostListingResult({ jobId, listingUrl: url, status: 'done', result });
    emit(jobId, 'host-listing-done', { jobId, ...result, status: 'done' });

    await randomDelay(2000, 4500, signal);
  } catch (err) {
    if (signal?.aborted) throw err;
    const result = {
      url,
      title: card.title || null,
      locationText: card.locationText || null,
      reviewsCount: card.reviewsCount ?? null,
      reviewsScore: card.reviewsScore ?? null,
      alNumber: null,
      photos: [],
      error: err.message,
    };
    store.saveHostListingResult({ jobId, listingUrl: url, status: 'error', result });
    emit(jobId, 'host-listing-done', { jobId, ...result, status: 'error' });
  } finally {
    if (page) await page.close().catch(() => {});
  }
}

module.exports = { runHostJob };
