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

// Bing canary: known-good ALs (found on Bing before, with their room) must
// come back from a Bing search. Bing's own results vary, so up to two are
// tried; any hit passes. Fallback canary from the 2026-10-12 tests.
const CANARY_EVERY = Math.max(5, parseInt(process.env.BING_CANARY_EVERY || '25', 10));
const FALLBACK_CANARY = { al: '179417', roomId: '1745634841481006060' };

async function bingCanaryOk(page) {
  const canaries = [...reg.bingCanaries(2), FALLBACK_CANARY].slice(0, 2);
  for (const c of canaries) {
    const ids = await bingCandidates(page, c.al);
    if (ids.includes(c.roomId)) return true;
    await randomDelay(3000, 5000).catch(() => {});
  }
  return false;
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

// Queue regular host jobs, in waves: hosts behind a match with no dossier yet,
// most registry licences first, but never more than HOST_EXPANSION_WAVE host
// jobs waiting at once. As dossiers finish, index.js tops the wave back up —
// so a 3k-licence import trickles through instead of flooding the queue.
// No minimum listing count: a 2-listing host is still expanded.
function queueHostExpansion(jobId) {
  const wave = Math.max(1, parseInt(process.env.HOST_EXPANSION_WAVE || '50', 10));
  const room = wave - reg.queuedHostJobs();
  if (room <= 0) return 0;
  const hosts = reg.hostsToExpand().slice(0, room);
  for (const h of hosts) {
    const id = nanoid(10);
    const name = (h.hostName || `Host ${h.hostId}`).slice(0, 120);
    const url = h.hostUrl || `https://www.airbnb.com/users/profile/${h.hostId}`;
    store.createJob({ id, urls: [url], name, type: 'host' });
    emit(id, 'job-created', { jobId: id, type: 'host', urls: [url], name, createdAt: nowSec() });
  }
  if (hosts.length && jobId) progress(jobId, { phase: 'expand', queued: hosts.length });
  return hosts.length;
}

// One free-matching run handles at most REGISTRY_CHUNK listing visits, then
// re-queues itself at the BACK of the queue, so host dossiers, syncs and the
// tracker get their turns in between instead of waiting a whole day.
function chunkSize() {
  return Math.max(10, parseInt(process.env.REGISTRY_CHUNK || '100', 10));
}

function queueNextChunk(jobId) {
  if (reg.queuedJobs('al-registry') > 0) return null;
  const id = nanoid(10);
  const name = 'AL registry: free matching (next chunk)';
  store.createJob({ id, urls: ['registry'], name, type: 'al-registry' });
  emit(id, 'job-created', { jobId: id, type: 'al-registry', urls: ['registry'], name, createdAt: nowSec() });
  progress(jobId, { phase: 'chunk-queued', next: id });
  return id;
}

// Keep free matching going without anyone pressing a button: queue a run when
// there is free work left (hosts to read, or Bing to try once its pause is
// over) and no run is already queued/running. Called on a timer by index.js.
function ensureRegistryRun() {
  if (reg.hasActiveJob('al-registry')) return null;
  const counts = reg.pipelineCounts();
  const bingReady = counts.waitingBing > 0 && !reg.bingBlockedUntil();
  if (!bingReady && counts.missingHost === 0) return null;
  const id = nanoid(10);
  const name = 'AL registry: free matching (auto)';
  store.createJob({ id, urls: ['registry'], name, type: 'al-registry' });
  emit(id, 'job-created', { jobId: id, type: 'al-registry', urls: ['registry'], name, createdAt: nowSec() });
  return id;
}

async function runAlRegistryJob(job, { signal }) {
  const jobId = job.id;
  const browser = new Browser();
  const budget = chunkSize();
  let visits = 0;
  let errored = false;
  let bingBlocked = false;
  try {
    // --- 0. dossiers (free, no browser) ---------------------------------
    const fromDossiers = reg.matchFromDossiers();
    progress(jobId, { phase: 'dossiers', matched: fromDossiers.length });

    // --- 1. hosts for found matches that never got one --------------------
    const missing = reg.matchesMissingHost().slice(0, budget);
    progress(jobId, { phase: 'hosts', total: missing.length, done: 0 });
    let done = 0;
    for (const { al, roomId } of missing) {
      if (signal?.aborted) return { cancelled: true };
      visits++;
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

    // --- 2. bing (free), gently ------------------------------------------------
    // Measured 2026-10-13: Bing cuts the VPS off after ~70 searches and a 3 h
    // pause was not enough. So each run does at most BING_PER_RUN (40) and then
    // Bing rests BING_BACKOFF_HOURS (6) even without a block (~160/day).
    // Paused or resting: skip Bing; index.js restarts free matching afterwards.
    const pause = reg.bingPause();
    const bingWindow = Math.max(1, parseInt(process.env.BING_PER_RUN || '40', 10));
    const pending = pause ? [] : reg.pendingAls('bing', Math.min(bingWindow, Math.max(0, budget - visits)));
    if (pause) progress(jobId, { phase: 'bing-paused', until: pause.until, reason: pause.reason });
    else progress(jobId, { phase: 'bing', total: pending.length, done: 0 });
    done = 0;
    let netFailures = 0;
    let searched = 0;
    // ALs marked "Bing tried" (not found) since the last good canary: if Bing
    // turns out to be quietly blocking, they are un-marked and retried later.
    let sinceCanary = [];

    const stopBing = (al, reason, message) => {
      bingBlocked = true;
      for (const a of sinceCanary) reg.updateMatch(a, { bing_tried: 0 });
      const until = reg.setBingBlocked(message, 'blocked');
      logger.warn(
        `registry: Bing ${reason} at ${al} (${String(message).slice(0, 80)}), ${sinceCanary.length} un-marked, paused until ${new Date(until * 1000).toISOString()}`
      );
      progress(jobId, { phase: 'bing-blocked', total: pending.length, done, al, until, reason, unmarked: sinceCanary.length });
      sinceCanary = [];
    };

    for (const al of pending) {
      if (signal?.aborted) return { cancelled: true };
      // A host job may have matched it in the meantime.
      if (reg.getMatch(al)?.status !== 'pending') {
        progress(jobId, { phase: 'bing', total: pending.length, done: ++done, al });
        continue;
      }
      // Canary: before the first search and every BING_CANARY_EVERY (25),
      // check that Bing still returns listings it found before.
      if (searched % CANARY_EVERY === 0) {
        try {
          const page = await browser.get();
          const ok = await bingCanaryOk(page);
          progress(jobId, { phase: 'bing-canary', ok, al });
          if (!ok) {
            stopBing(al, 'quiet block (canary missing)', 'canary: Bing stopped returning known listings');
            break;
          }
          sinceCanary = [];
          await randomDelay(4000, 7000, signal).catch(() => {});
        } catch (err) {
          if (signal?.aborted) return { cancelled: true };
          stopBing(al, 'blocked during canary', err.message);
          break;
        }
      }
      visits++;
      searched++;
      try {
        const page = await browser.get();
        const ids = await bingCandidates(page, al);
        netFailures = 0;
        const { verified } = ids.length
          ? await verifyCandidates(page, al, ids, signal)
          : { verified: null };
        if (verified) saveVerified(al, verified, 'bing');
        else sinceCanary.push(al);
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
        if (err.code === 'bing-network') netFailures++;
        if (err.code === 'bing-blocked' || netFailures >= 3) {
          // Stop and back off: the rest stay pending AND untried, so nothing
          // reaches the paid step because of a block, and the run resumes by
          // itself once the pause is over. A block is expected, not an error.
          stopBing(al, 'blocked', err.message);
          break;
        }
        // One-off failure: leave this AL untried for the next run.
        logger.warn(`registry bing failed for ${al}:`, err.message);
        await browser.resetPage();
        progress(jobId, { phase: 'bing', total: pending.length, done: ++done, al, error: err.message });
      }
      await randomDelay(4000, 7000, signal).catch(() => {});
    }

    // A full window without a block still earns Bing a rest.
    if (!bingBlocked && searched > 0 && pending.length >= bingWindow) {
      const until = reg.setBingBlocked(`rest after ${searched} searches`, 'rest');
      progress(jobId, { phase: 'bing-rest', searched, until });
    }
  } finally {
    await browser.close();
  }

  if (signal?.aborted) return { cancelled: true, errored };

  // --- 3. expand hosts (one wave of regular host jobs) ----------------------
  queueHostExpansion(jobId);

  // More work than one chunk? Go to the back of the queue and continue later.
  const more =
    reg.matchesMissingHost().length > 0 || (!bingBlocked && !reg.bingPause() && reg.pendingAls('bing', 1).length > 0);
  if (more && visits > 0) queueNextChunk(jobId);

  progress(jobId, { phase: 'done', bingBlocked, visits });
  return { cancelled: false, errored };
}

// Google runs in chunks too: a big batch (e.g. "all pending") handles
// GOOGLE_CHUNK licences per turn and re-queues the rest at the back of the
// queue, so host dossiers for newly found hosts run in between.
function queueGoogleRest(jobId, rest) {
  if (!rest.length) return null;
  const id = nanoid(10);
  const name = `AL registry: Google search (${rest.length} left)`;
  store.createJob({ id, urls: rest, name, type: 'al-google' });
  emit(id, 'job-created', { jobId: id, type: 'al-google', urls: rest, name, createdAt: nowSec() });
  progress(jobId, { phase: 'chunk-queued', next: id, left: rest.length });
  return id;
}

async function runAlGoogleJob(job, { signal }) {
  const jobId = job.id;
  const chunk = Math.max(5, parseInt(process.env.GOOGLE_CHUNK || '50', 10));
  const all = job.urls.map(String);
  const als = all.slice(0, chunk);
  const rest = all.slice(chunk);
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

  if (!signal?.aborted) {
    queueHostExpansion(jobId);
    // Out of credits: keep the rest pending (no job). Otherwise continue later.
    if (!pausedNoCredits) queueGoogleRest(jobId, rest);
  }
  progress(jobId, { phase: 'done', pausedNoCredits });
  return { cancelled: !!signal?.aborted, errored: false };
}

module.exports = { runAlRegistryJob, runAlGoogleJob, queueHostExpansion, ensureRegistryRun };
