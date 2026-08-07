const { getDb } = require('../db');

// Bump whenever the scraper produces meaningfully different output for the
// same URL — adds a column, changes price-extraction logic, etc. Cached
// rows with a lower version are treated as cache-miss so the next run
// re-scrapes with the new code.
//   v1 — real Airbnb scrape (replaces SCRAPER_STUB=1 placeholder data).
//   v2 — result shape is now { meta, months }; meta carries title +
//        reviewsCount + reviewsScore scraped from the listing page.
const SCHEMA_VERSION = 2;

const EMPTY_META = { title: null, reviewsCount: null, reviewsScore: null };

// Stored results are either the legacy bare months-array (schema v1 and the
// live-progress payloads) or the current { meta, months } object. Normalize
// to the object shape so consumers never have to branch.
function normalizeResult(result) {
  if (Array.isArray(result)) return { meta: { ...EMPTY_META }, months: result };
  if (result && typeof result === 'object') {
    return {
      meta: { ...EMPTY_META, ...(result.meta || {}) },
      months: Array.isArray(result.months) ? result.months : [],
    };
  }
  return { meta: { ...EMPTY_META }, months: [] };
}

const TERMINAL = new Set(['done', 'error', 'cancelled', 'interrupted']);

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function createJob({ id, urls, name = '', location = '', type = 'adr' }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (id, created_at, status, urls_json, name, location, type)
     VALUES (?, ?, 'queued', ?, ?, ?, ?)`
  ).run(id, nowSec(), JSON.stringify(urls), name, location, type);
}

function getJob(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  if (!row) return null;
  return hydrateJob(row);
}

function listJobs(limit = 30, type = null) {
  const db = getDb();
  const rows = type
    ? db
        .prepare(`SELECT * FROM jobs WHERE type = ? ORDER BY created_at DESC LIMIT ?`)
        .all(type, limit)
    : db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit);
  return rows.map(hydrateJob);
}

function hydrateJob(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    urls: JSON.parse(row.urls_json),
    name: row.name || '',
    location: row.location || '',
    type: row.type || 'adr',
  };
}

function getNextQueued() {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`)
    .get();
  return row ? hydrateJob(row) : null;
}

function setStatus(id, status, extra = {}) {
  const db = getDb();
  const sets = ['status = ?'];
  const vals = [status];
  if (extra.startedAt !== undefined) {
    sets.push('started_at = ?');
    vals.push(extra.startedAt);
  }
  if (extra.finishedAt !== undefined) {
    sets.push('finished_at = ?');
    vals.push(extra.finishedAt);
  }
  vals.push(id);
  db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

function markRunning(id) {
  setStatus(id, 'running', { startedAt: nowSec() });
}

function markTerminal(id, status) {
  if (!TERMINAL.has(status)) throw new Error(`Not a terminal status: ${status}`);
  setStatus(id, status, { finishedAt: nowSec() });
}

function recoverInterruptedOnBoot() {
  const db = getDb();
  return db
    .prepare(
      `UPDATE jobs SET status = 'interrupted', finished_at = ? WHERE status = 'running'`
    )
    .run(nowSec()).changes;
}

function deleteJob(id) {
  const db = getDb();
  const tx = db.transaction((jobId) => {
    db.prepare(`DELETE FROM job_events WHERE job_id = ?`).run(jobId);
    db.prepare(`DELETE FROM listing_results WHERE job_id = ?`).run(jobId);
    db.prepare(`DELETE FROM excluded_cells WHERE job_id = ?`).run(jobId);
    db.prepare(`DELETE FROM host_results WHERE job_id = ?`).run(jobId);
    db.prepare(`DELETE FROM host_meta WHERE job_id = ?`).run(jobId);
    db.prepare(`DELETE FROM jobs WHERE id = ?`).run(jobId);
  });
  tx(id);
}

function appendEvent({ jobId, type, payload }) {
  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO job_events (job_id, event_type, payload_json, ts) VALUES (?, ?, ?, ?)`
    )
    .run(jobId, type, JSON.stringify(payload), nowSec());
  return info.lastInsertRowid;
}

function eventsAfter(seq) {
  const db = getDb();
  return db
    .prepare(
      `SELECT seq, job_id AS jobId, event_type AS type, payload_json AS payload, ts
       FROM job_events WHERE seq > ? ORDER BY seq ASC`
    )
    .all(seq)
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

function lastEventSeq() {
  const db = getDb();
  const row = db.prepare(`SELECT MAX(seq) AS m FROM job_events`).get();
  return row?.m || 0;
}

function saveListingResult({ jobId, url, status, result }) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO listing_results
       (job_id, url, status, result_json, finished_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(jobId, url, status, JSON.stringify(result), nowSec());
}

function listingResults(jobId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT url, status, result_json AS result, finished_at AS finishedAt
       FROM listing_results WHERE job_id = ? ORDER BY finished_at ASC`
    )
    .all(jobId)
    .map((r) => {
      const { meta, months } = normalizeResult(JSON.parse(r.result));
      // `result` stays as the months array for backward compatibility with
      // any existing consumers; `meta` is exposed alongside it.
      return { url: r.url, status: r.status, finishedAt: r.finishedAt, meta, result: months };
    });
}

// --- Manual per-job ADR-cell exclusions ------------------------------------
// A cell is (url, monthIndex 0..11). Returned as "url|monthIndex" strings so
// the frontend can key a Set directly.
function excludedCells(jobId) {
  const db = getDb();
  return db
    .prepare(`SELECT url, month_index AS monthIndex FROM excluded_cells WHERE job_id = ?`)
    .all(jobId)
    .map((r) => `${r.url}|${r.monthIndex}`);
}

function setCellExcluded({ jobId, url, monthIndex, excluded }) {
  const db = getDb();
  if (excluded) {
    db.prepare(
      `INSERT OR IGNORE INTO excluded_cells (job_id, url, month_index) VALUES (?, ?, ?)`
    ).run(jobId, url, monthIndex);
  } else {
    db.prepare(
      `DELETE FROM excluded_cells WHERE job_id = ? AND url = ? AND month_index = ?`
    ).run(jobId, url, monthIndex);
  }
}

function cacheLookup(url, ttlDays) {
  const db = getDb();
  const cutoff = nowSec() - ttlDays * 86400;
  const row = db
    .prepare(
      `SELECT result_json, last_analysed_at FROM listings
       WHERE url = ?
         AND last_analysed_at >= ?
         AND schema_version >= ?`
    )
    .get(url, cutoff, SCHEMA_VERSION);
  if (!row) return null;
  return { result: JSON.parse(row.result_json), lastAnalysedAt: row.last_analysed_at };
}

function cacheUpsert(url, result) {
  const db = getDb();
  db.prepare(
    `INSERT INTO listings (url, last_analysed_at, result_json, schema_version)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       last_analysed_at = excluded.last_analysed_at,
       result_json = excluded.result_json,
       schema_version = excluded.schema_version`
  ).run(url, nowSec(), JSON.stringify(result), SCHEMA_VERSION);
}

function insertScrapeAttempt(row) {
  const db = getDb();
  db.prepare(
    `INSERT INTO scrape_attempts
       (job_id, url, month, sample_start, sample_end, sample_nights, outcome, total_price, duration_ms, ts)
     VALUES (@jobId, @url, @month, @sampleStart, @sampleEnd, @sampleNights, @outcome, @totalPrice, @durationMs, @ts)`
  ).run({
    jobId: row.jobId,
    url: row.url,
    month: row.month,
    sampleStart: row.sampleStart,
    sampleEnd: row.sampleEnd,
    sampleNights: row.sampleNights,
    outcome: row.outcome,
    totalPrice: row.totalPrice ?? null,
    durationMs: row.durationMs,
    ts: row.ts || nowSec(),
  });
}

function scrapeAttemptsForJob(jobId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT id, job_id AS jobId, url, month, sample_start AS sampleStart,
              sample_end AS sampleEnd, sample_nights AS sampleNights,
              outcome, total_price AS totalPrice, duration_ms AS durationMs, ts
         FROM scrape_attempts
        WHERE job_id = ?
        ORDER BY ts ASC, id ASC`
    )
    .all(jobId);
}

function eventsForJob(jobId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT seq, event_type AS type, payload_json AS payload, ts
         FROM job_events
        WHERE job_id = ?
        ORDER BY seq ASC`
    )
    .all(jobId)
    .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

// --- Host-analyzer -----------------------------------------------------------

function upsertHostMeta({ jobId, hostUrl, hostId = null, hostName = null, listingsCount = null }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO host_meta (job_id, host_url, host_id, host_name, listings_count, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET
       host_url = excluded.host_url,
       host_id = COALESCE(excluded.host_id, host_meta.host_id),
       host_name = COALESCE(excluded.host_name, host_meta.host_name),
       listings_count = COALESCE(excluded.listings_count, host_meta.listings_count),
       updated_at = excluded.updated_at`
  ).run(jobId, hostUrl, hostId, hostName, listingsCount, nowSec());
}

function getHostMeta(jobId) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM host_meta WHERE job_id = ?`).get(jobId);
  if (!row) return null;
  return {
    jobId: row.job_id,
    hostUrl: row.host_url,
    hostId: row.host_id,
    hostName: row.host_name,
    listingsCount: row.listings_count,
    adrJobIds: JSON.parse(row.adr_job_ids_json || '[]'),
    updatedAt: row.updated_at,
  };
}

function addAdrJobIds(jobId, adrJobIds) {
  const db = getDb();
  const meta = getHostMeta(jobId);
  const merged = Array.from(new Set([...(meta?.adrJobIds || []), ...adrJobIds]));
  db.prepare(`UPDATE host_meta SET adr_job_ids_json = ?, updated_at = ? WHERE job_id = ?`).run(
    JSON.stringify(merged),
    nowSec(),
    jobId
  );
  return merged;
}

function saveHostListingResult({ jobId, listingUrl, status, result }) {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO host_results (job_id, listing_url, status, result_json, finished_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(jobId, listingUrl, status, JSON.stringify(result), nowSec());
}

function hostListingResults(jobId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT listing_url AS url, status, result_json AS result, finished_at AS finishedAt
       FROM host_results WHERE job_id = ? ORDER BY finished_at ASC`
    )
    .all(jobId)
    .map((r) => ({ url: r.url, status: r.status, finishedAt: r.finishedAt, ...JSON.parse(r.result) }));
}

function alLicenseLookup(alNumber, ttlDays = 30) {
  const db = getDb();
  const cutoff = nowSec() - ttlDays * 86400;
  const row = db
    .prepare(`SELECT * FROM al_licenses WHERE al_number = ? AND fetched_at >= ?`)
    .get(String(alNumber), cutoff);
  if (!row) return null;
  return {
    alNumber: row.al_number,
    fetchedAt: row.fetched_at,
    rnt: JSON.parse(row.rnt_json),
    lat: row.lat,
    lng: row.lng,
    geocodeStatus: row.geocode_status,
  };
}

function alLicenseUpsert({ alNumber, rnt, lat = null, lng = null, geocodeStatus = 'pending' }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO al_licenses (al_number, fetched_at, rnt_json, lat, lng, geocode_status)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(al_number) DO UPDATE SET
       fetched_at = excluded.fetched_at,
       rnt_json = excluded.rnt_json,
       lat = COALESCE(excluded.lat, al_licenses.lat),
       lng = COALESCE(excluded.lng, al_licenses.lng),
       geocode_status = excluded.geocode_status`
  ).run(String(alNumber), nowSec(), JSON.stringify(rnt), lat, lng, geocodeStatus);
}

function alLicenseSetGeocode(alNumber, { lat, lng, geocodeStatus }) {
  const db = getDb();
  db.prepare(`UPDATE al_licenses SET lat = ?, lng = ?, geocode_status = ? WHERE al_number = ?`).run(
    lat,
    lng,
    geocodeStatus,
    String(alNumber)
  );
}

// All completed host jobs with their listings + host meta — the funnel input.
function allHostJobs() {
  const db = getDb();
  const rows = db
    .prepare(`SELECT * FROM jobs WHERE type = 'host' ORDER BY created_at DESC`)
    .all();
  return rows.map((row) => {
    const job = hydrateJob(row);
    return {
      job,
      host: getHostMeta(job.id),
      listings: hostListingResults(job.id),
    };
  });
}

function globalMetrics({ windowSeconds = 7 * 86400 } = {}) {
  const db = getDb();
  const cutoff = nowSec() - windowSeconds;

  const byOutcome = db
    .prepare(
      `SELECT outcome, COUNT(*) AS n
         FROM scrape_attempts
        WHERE ts >= ?
        GROUP BY outcome`
    )
    .all(cutoff);

  const cacheStats = db
    .prepare(
      `SELECT
         SUM(CASE WHEN status = 'cached' THEN 1 ELSE 0 END) AS cached,
         COUNT(*) AS total
         FROM listing_results
        WHERE finished_at >= ?`
    )
    .get(cutoff);

  const jobsCompleted = db
    .prepare(
      `SELECT id, started_at AS startedAt, finished_at AS finishedAt
         FROM jobs
        WHERE status IN ('done','error','cancelled','interrupted')
          AND finished_at IS NOT NULL
          AND started_at IS NOT NULL
          AND finished_at >= ?
        ORDER BY finished_at DESC
        LIMIT 200`
    )
    .all(cutoff);

  return { byOutcome, cacheStats, jobsCompleted, windowSeconds };
}

module.exports = {
  createJob,
  getJob,
  listJobs,
  getNextQueued,
  markRunning,
  markTerminal,
  setStatus,
  recoverInterruptedOnBoot,
  deleteJob,
  appendEvent,
  eventsAfter,
  lastEventSeq,
  saveListingResult,
  listingResults,
  upsertHostMeta,
  getHostMeta,
  addAdrJobIds,
  saveHostListingResult,
  hostListingResults,
  alLicenseLookup,
  alLicenseUpsert,
  alLicenseSetGeocode,
  allHostJobs,
  excludedCells,
  setCellExcluded,
  cacheLookup,
  cacheUpsert,
  insertScrapeAttempt,
  scrapeAttemptsForJob,
  eventsForJob,
  globalMetrics,
  TERMINAL,
};
