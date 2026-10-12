// AL Registry pipeline — cheapest step first, the database always asked first.
//
//   al-registry job (free):
//     0. dossiers  match every open AL against existing host dossiers
//     1. hosts     read the host of found matches that never got one
//     2. bing      Bing + on-page verification for ALs Bing never tried
//     3. expand    queue a normal host job for every host behind a match that
//                  has no fresh dossier — its other listings come back as
//                  host_results and step 0 (re-run after each host job, see
//                  index.js) matches them to registry ALs for free.
//   al-google job (paid, explicit user action, small batches):
//     searches ALs still pending after the free steps through the provider
//     chain (lib/searchProviders). Every AL is saved as it finishes; if every
//     provider is out of credits the job stops and the rest stay pending.
//
// One browser page, strictly sequential with 5–9 s gaps: in parallel, Airbnb
// starts bouncing listing pages to its homepage.

const { nanoid } = require('nanoid');
const { launchContext } = require('../scraper/browser');
const { bingCandidates, candidatesFromResults, verifyListing } = require('../lib/alSearch');
const { searchAl } = require('../lib/searchProviders');
const { randomDelay } = require('../lib/delay');
const reg = require('../jobs/alRegistryStore');
const store = require('../jobs/jobStore');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const BROWSER_WORKER_ID = 0; // jobs run one at a time; reuse worker-0 profile

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function progress(jobId, payload) {
  emit(jobId, 'al-registry', { jobId, ...payload });
}

function saveVerified(al, v, via) {
  reg.updateMatch(al, {
    status: 'found',
    found_via: via,
    room_id: v.roomId,
    listing_url: `https://www.airbnb.com/rooms/${v.roomId}`,
    listing_title: v.title || null,
    host_id: v.hostId || null,
    host_url: v.hostUrl || null,
    host_name: v.hostName || null,
    checked_at: nowSec(),
    error: null,
  });
}

// Verify candidates in order; stop at the first page that shows the AL.
async function verifyCandidates(page, al, ids, signal) {
  const outcomes = [];
  for (const id of ids) {
    if (signal?.aborted) throw new Error('Aborted');
    const v = await verifyListing(page, id, al, { signal });
    outcomes.push(v);
    if (v.status === 'verified') return { verified: v, outcomes };
    await randomDelay(5000, 9000, signal);
  }
  return { verified: null, outcomes };
}

class Browser {
  constructor() {
    this.session = null;
    this.page = null;
  }
  async get() {
    if (!this.session) this.session = await launchContext(BROWSER_WORKER_ID);
    if (!this.page || this.page.isClosed?.()) this.page = await this.session.context.newPage();
    return this.page;
  }
  async resetPage() {
    if (this.page) await this.page.close().catch(() => {});
    this.page = null;
  }
  async close() {
    if (this.session) await this.session.close().catch(() => {});
    this.session = null;
    this.page = null;
  }
}

// Queue a regular host job for every host behind a match that lacks a fresh
// dossier. No minimum listing count: a 2-listing host is still expanded.
function queueHostExpansion(jobId) {
  const days = parseInt(process.env.HOST_REFRESH_DAYS || '14', 10);
  const hosts = reg.hostsToExpand(days);
  for (const h of hosts) {
    const id = nanoid(10);
    const name = (h.hostName || `Host ${h.hostId}`).slice(0, 120);
    const url = h.hostUrl || `https://www.airbnb.com/users/profile/${h.hostId}`;
    store.createJob({ id, urls: [url], name, type: 'host' });
    emit(id, 'job-created', { jobId: id, type: 'host', urls: [url], name, createdAt: nowSec() });
  }
  if (hosts.length) progress(jobId, { phase: 'expand', queued: hosts.length });
  return hosts.length;
}

async function runAlRegistryJob(job, { signal }) {
  const jobId = job.id;
  const browser = new Browser();
  let errored = false;
  try {
    // --- 0. dossiers (free, no browser) ---------------------------------
    const fromDossiers = reg.matchFromDossiers();
    progress(jobId, { phase: 'dossiers', matched: fromDossiers.length });

    // --- 1. hosts for found matches that never got one --------------------
    const missing = reg.matchesMissingHost();
    progress(jobId, { phase: 'hosts', total: missing.length, done: 0 });
    let done = 0;
    for (const { al, roomId } of missing) {
      if (signal?.aborted) return { cancelled: true };
      try {
        const page = await browser.get();
        const v = await verifyListing(page, roomId, al, { signal });
        if (v.status === 'verified') {
          reg.updateMatch(al, {
            host_id: v.hostId || null,
            host_url: v.hostUrl || null,
            host_name: v.hostName || null,
            listing_title: v.title || null,
            checked_at: nowSec(),
          });
        } else if (v.status === 'delisted') {
          reg.updateMatch(al, { status: 'delisted', checked_at: nowSec() });
        }
      } catch (err) {
        if (signal?.aborted) return { cancelled: true };
        logger.warn(`registry host fill failed for ${al}:`, err.message);
        await browser.resetPage();
      }
      progress(jobId, { phase: 'hosts', total: missing.length, done: ++done, al });
      await randomDelay(5000, 9000, signal).catch(() => {});
    }

    // --- 2. bing (free) ---------------------------------------------------
    const pending = reg.pendingAls('bing');
    progress(jobId, { phase: 'bing', total: pending.length, done: 0 });
    done = 0;
    for (const al of pending) {
      if (signal?.aborted) return { cancelled: true };
      // A host job may have matched it in the meantime.
      if (reg.getMatch(al)?.status !== 'pending') {
        progress(jobId, { phase: 'bing', total: pending.length, done: ++done, al });
        continue;
      }
      try {
        const page = await browser.get();
        const ids = await bingCandidates(page, al);
        const { verified } = ids.length
          ? await verifyCandidates(page, al, ids, signal)
          : { verified: null };
        if (verified) saveVerified(al, verified, 'bing');
        reg.updateMatch(al, { bing_tried: 1, ...(verified ? {} : { checked_at: nowSec() }) });
        progress(jobId, {
          phase: 'bing',
          total: pending.length,
          done: ++done,
          al,
          status: verified ? 'found' : 'pending',
        });
      } catch (err) {
        if (signal?.aborted) return { cancelled: true };
        errored = true;
        logger.warn(`registry bing failed for ${al}:`, err.message);
        await browser.resetPage();
        progress(jobId, { phase: 'bing', total: pending.length, done: ++done, al, error: err.message });
      }
      await randomDelay(4000, 7000, signal).catch(() => {});
    }
  } finally {
    await browser.close();
  }

  // --- 3. expand hosts (queues regular host jobs) ---------------------------
  if (!signal?.aborted) queueHostExpansion(jobId);
  progress(jobId, { phase: 'done' });
  return { cancelled: !!signal?.aborted, errored };
}

async function runAlGoogleJob(job, { signal }) {
  const jobId = job.id;
  const als = job.urls.map(String);
  const browser = new Browser();
  let pausedNoCredits = false;
  let done = 0;
  progress(jobId, { phase: 'google', total: als.length, done });
  try {
    for (const al of als) {
      if (signal?.aborted) return { cancelled: true };
      const m = reg.getMatch(al);
      if (!m || m.status !== 'pending' || m.google_tried) {
        progress(jobId, { phase: 'google', total: als.length, done: ++done, al, skipped: true });
        continue;
      }

      const search = await searchAl(al, signal);
      if (search.exhausted) {
        pausedNoCredits = true;
        progress(jobId, { phase: 'paused', reason: 'no-credits', remaining: als.length - done });
        break;
      }

      const { exact, loose } = candidatesFromResults(search.results, al);
      let status = 'not_found';
      try {
        const page = await browser.get();
        const { verified, outcomes } = await verifyCandidates(page, al, [...exact, ...loose], signal);
        if (verified) {
          saveVerified(al, verified, 'google');
          status = 'found';
        } else {
          const delisted = outcomes.find((o) => o.status === 'delisted' && exact.includes(o.roomId));
          const failed = outcomes.length > 0 && outcomes.every((o) => o.status === 'error');
          if (failed) {
            // Search is cached, so leaving it pending makes a retry free.
            status = 'pending';
            reg.updateMatch(al, { error: outcomes[0].error, checked_at: nowSec() });
          } else if (delisted) {
            status = 'delisted';
            reg.updateMatch(al, {
              status,
              found_via: 'google',
              room_id: delisted.roomId,
              listing_url: `https://www.airbnb.com/rooms/${delisted.roomId}`,
              checked_at: nowSec(),
              error: null,
            });
          } else {
            reg.updateMatch(al, { status, checked_at: nowSec(), error: null });
          }
        }
        if (status !== 'pending') reg.updateMatch(al, { google_tried: 1 });
      } catch (err) {
        if (signal?.aborted) return { cancelled: true };
        logger.warn(`registry google verify failed for ${al}:`, err.message);
        await browser.resetPage();
        reg.updateMatch(al, { error: err.message.slice(0, 200), checked_at: nowSec() });
        status = 'pending';
      }
      progress(jobId, {
        phase: 'google',
        total: als.length,
        done: ++done,
        al,
        status,
        provider: search.provider,
        cached: !!search.cached,
      });
      await randomDelay(3000, 6000, signal).catch(() => {});
    }
  } finally {
    await browser.close();
  }

  if (!signal?.aborted) queueHostExpansion(jobId);
  progress(jobId, { phase: 'done', pausedNoCredits });
  return { cancelled: !!signal?.aborted, errored: false };
}

module.exports = { runAlRegistryJob, runAlGoogleJob, queueHostExpansion };
