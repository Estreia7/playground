// Dossier auto-sync (job type 'host-sync'): triggered by the tracker when a
// host's declared listing count no longer matches the dossier. Re-discovers
// the current listing URLs, scrapes ONLY the new ones into the newest done
// dossier, and marks vanished listings as removed (kept, never deleted),
// logging both to host_listing_events. All SSE goes out under the dossier's
// job id so an open dossier updates live.

const { launchContext } = require('../scraper/browser');
const { scrapeHostProfile } = require('../scraper/hostProfile');
const { processHostListing } = require('./hostWorker');
const { fetchRnt } = require('../lib/rnt');
const { geocodeAddress } = require('../lib/geocode');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const DISCOVERY_TIMEOUT_MS = 20 * 60 * 1000;
// Never mark removals off a suspiciously thin harvest: if discovery found
// fewer than this share of the declared count, the sweep was probably partial.
const REMOVAL_CONFIDENCE = 0.8;

function withTimeout(promise, ms, label) {
  let timer;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

async function runHostSyncJob(job, { signal }) {
  const profileUrl = job.urls[0];
  const idMatch = profileUrl.match(/\/users\/(?:profile|show)\/(\d+)/i);
  if (!idMatch) return { cancelled: false, errored: true };
  const hostId = idMatch[1];
  const maxListings = parseInt(process.env.HOST_MAX_LISTINGS || '300', 10);

  // --- Discovery ------------------------------------------------------------
  let profile;
  let session = null;
  try {
    session = await launchContext(0);
    const page = await session.context.newPage();
    profile = await withTimeout(
      scrapeHostProfile(page, profileUrl, signal, () => {}),
      DISCOVERY_TIMEOUT_MS,
      'sync discovery'
    );
    await page.close().catch(() => {});
  } catch (err) {
    if (signal?.aborted) return { cancelled: true, errored: false };
    logger.error(`host-sync discovery failed for ${profileUrl}`, err);
    return { cancelled: false, errored: true };
  } finally {
    if (session) await session.close().catch(() => {});
    session = null;
  }

  if (profile.listingsCount != null) {
    store.insertHostSnapshot({
      hostId,
      listingsCount: profile.listingsCount,
      source: 'tracker',
      jobId: job.id,
    });
    emit(job.id, 'host-snapshot', {
      jobId: job.id,
      hostId,
      listingsCount: profile.listingsCount,
      ts: Math.floor(Date.now() / 1000),
    });
  }
  store.touchTrackedHost(hostId);

  const dossier = store.latestHostJobForHost(hostId);
  if (!dossier) {
    logger.warn(`host-sync ${job.id}: no completed dossier for host ${hostId}`);
    return { cancelled: false, errored: false };
  }
  const dossierId = dossier.id;

  // --- Diff -----------------------------------------------------------------
  const discovered = new Map(profile.listings.map((c) => [c.url, c]));
  const existing = store.hostListingResults(dossierId);
  const existingUrls = new Set(existing.map((r) => r.url));
  const now = Math.floor(Date.now() / 1000);

  const added = profile.listings
    .filter((c) => !existingUrls.has(c.url))
    .slice(0, Math.max(0, maxListings - existing.length));

  const declared = profile.listingsCount ?? discovered.size;
  const harvestOk = discovered.size >= Math.floor(declared * REMOVAL_CONFIDENCE);
  const removed = harvestOk
    ? existing.filter((r) => !r.removed && !discovered.has(r.url))
    : [];
  if (!harvestOk) {
    logger.warn(
      `host-sync ${job.id}: harvested ${discovered.size}/${declared} — skipping removal marking`
    );
  }

  // Previously-removed listings that are back online.
  const returned = existing.filter((r) => r.removed && discovered.has(r.url));

  logger.info(
    `host-sync ${job.id}: host ${hostId} → +${added.length} added, −${removed.length} removed, ${returned.length} returned`
  );

  // --- Mark removals / returns ---------------------------------------------
  for (const r of removed) {
    const result = store.patchHostListingResult(dossierId, r.url, { removed: true, removedAt: now });
    store.insertHostListingEvent({
      hostId,
      jobId: dossierId,
      listingUrl: r.url,
      event: 'removed',
      title: r.title || null,
      ts: now,
    });
    if (result) {
      emit(dossierId, 'host-listing-done', { jobId: dossierId, ...result, status: r.status });
    }
  }
  for (const r of returned) {
    const result = store.patchHostListingResult(dossierId, r.url, {
      removed: false,
      removedAt: null,
    });
    store.insertHostListingEvent({
      hostId,
      jobId: dossierId,
      listingUrl: r.url,
      event: 'added',
      title: r.title || null,
      ts: now,
    });
    if (result) {
      emit(dossierId, 'host-listing-done', { jobId: dossierId, ...result, status: r.status });
    }
  }

  // --- Scrape new listings into the dossier ---------------------------------
  let errored = false;
  if (added.length > 0 && !signal?.aborted) {
    let ctx = null;
    try {
      ctx = await launchContext(0);
      for (const card of added) {
        if (signal?.aborted) break;
        store.insertHostListingEvent({
          hostId,
          jobId: dossierId,
          listingUrl: card.url,
          event: 'added',
          title: card.title || null,
          ts: now,
        });
        await processHostListing({ jobId: dossierId, card, ctx, signal });
      }
    } catch (err) {
      if (!signal?.aborted) {
        errored = true;
        logger.error(`host-sync ${job.id}: listing scrape failed`, err);
      }
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }

    // Registry for newly found AL numbers (cache-aware, browsers closed).
    const rntTtlDays = parseInt(process.env.RNT_CACHE_TTL_DAYS || '30', 10);
    const newAls = [
      ...new Set(
        store
          .hostListingResults(dossierId)
          .filter((r) => added.some((c) => c.url === r.url))
          .map((r) => r.alNumber)
          .filter(Boolean)
      ),
    ];
    for (const alNumber of newAls) {
      if (signal?.aborted) break;
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
        emit(dossierId, 'host-license-done', {
          jobId: dossierId,
          alNumber,
          cached,
          rnt: entry.rnt,
          lat: entry.lat,
          lng: entry.lng,
          geocodeStatus: entry.geocodeStatus,
        });
      } catch (err) {
        if (signal?.aborted) break;
        logger.warn(`host-sync RNT lookup failed for ${alNumber}:`, err.message);
      }
    }
  }

  return { cancelled: !!signal?.aborted, errored };
}

module.exports = { runHostSyncJob };
