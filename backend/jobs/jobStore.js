const { getDb } = require('../db');

const TERMINAL = new Set(['done', 'error', 'cancelled', 'interrupted']);

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function createJob({ id, urls }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO jobs (id, created_at, status, urls_json)
     VALUES (?, ?, 'queued', ?)`
  ).run(id, nowSec(), JSON.stringify(urls));
}

function getJob(id) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(id);
  if (!row) return null;
  return hydrateJob(row);
}

function listJobs(limit = 30) {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?`).all(limit);
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
    .map((r) => ({ ...r, result: JSON.parse(r.result) }));
}

function cacheLookup(url, ttlDays) {
  const db = getDb();
  const cutoff = nowSec() - ttlDays * 86400;
  const row = db
    .prepare(
      `SELECT result_json, last_analysed_at FROM listings
       WHERE url = ? AND last_analysed_at >= ?`
    )
    .get(url, cutoff);
  if (!row) return null;
  return { result: JSON.parse(row.result_json), lastAnalysedAt: row.last_analysed_at };
}

function cacheUpsert(url, result) {
  const db = getDb();
  db.prepare(
    `INSERT INTO listings (url, last_analysed_at, result_json)
     VALUES (?, ?, ?)
     ON CONFLICT(url) DO UPDATE SET
       last_analysed_at = excluded.last_analysed_at,
       result_json = excluded.result_json`
  ).run(url, nowSec(), JSON.stringify(result));
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
  cacheLookup,
  cacheUpsert,
  TERMINAL,
};
