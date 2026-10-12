// AL Registry persistence: imported RNAL rows, their Airbnb matches, the
// raw search cache and the paid-search bookkeeping (usage + provider state).
//
// Matching rule of thumb: the database is always asked first. An AL that a
// host dossier already shows (host_results) is matched for free and never
// searched; an AL already searched by a provider is served from the cache.

const { getDb } = require('../db');

const ROOM_RE = /\/rooms\/(?:plus\/)?(\d+)/;
const OPEN_STATUSES = ['pending', 'not_found', 'delisted', 'error'];

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function roomIdOf(url) {
  const m = String(url || '').match(ROOM_RE);
  return m ? m[1] : null;
}

function cleanAl(raw) {
  const m = String(raw || '').trim().match(/^(\d{1,9})(?:\s*\/\s*AL)?$/i);
  return m ? m[1] : null;
}

function intOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

// --- Import ------------------------------------------------------------------

// Upserts registry rows and opens a pending match for every new AL. Existing
// matches are never reset by a re-import.
function importRows(rows, sourceFile) {
  const db = getDb();
  const ts = nowSec();
  const upsert = db.prepare(
    `INSERT INTO al_registry (al_number, name, registered_at, modalidade, camas, utentes,
                              quartos, address, postal_code, localidade, freguesia, concelho,
                              source_file, imported_at)
     VALUES (@al, @name, @registeredAt, @modalidade, @camas, @utentes, @quartos, @address,
             @postalCode, @localidade, @freguesia, @concelho, @sourceFile, @ts)
     ON CONFLICT(al_number) DO UPDATE SET
       name = excluded.name, registered_at = excluded.registered_at,
       modalidade = excluded.modalidade, camas = excluded.camas, utentes = excluded.utentes,
       quartos = excluded.quartos, address = excluded.address,
       postal_code = excluded.postal_code, localidade = excluded.localidade,
       freguesia = excluded.freguesia, concelho = excluded.concelho,
       source_file = excluded.source_file, imported_at = excluded.imported_at`
  );
  const openMatch = db.prepare(
    `INSERT OR IGNORE INTO al_airbnb_matches (al_number, status) VALUES (?, 'pending')`
  );

  let imported = 0;
  let skipped = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const al = cleanAl(r.alNumber);
      if (!al) {
        skipped++;
        continue;
      }
      upsert.run({
        al,
        name: r.name || null,
        registeredAt: r.registeredAt || null,
        modalidade: r.modalidade || null,
        camas: intOrNull(r.camas),
        utentes: intOrNull(r.utentes),
        quartos: intOrNull(r.quartos),
        address: r.address || null,
        postalCode: r.postalCode || null,
        localidade: r.localidade || null,
        freguesia: r.freguesia || null,
        concelho: r.concelho || null,
        sourceFile: sourceFile || null,
        ts,
      });
      openMatch.run(al);
      imported++;
    }
  });
  tx();
  return { imported, skipped };
}

// --- Matches -----------------------------------------------------------------

function getMatch(al) {
  return getDb().prepare(`SELECT * FROM al_airbnb_matches WHERE al_number = ?`).get(String(al)) || null;
}

const MATCH_COLUMNS = [
  'status', 'found_via', 'room_id', 'listing_url', 'listing_title', 'host_id', 'host_url',
  'host_name', 'bing_tried', 'google_tried', 'checked_at', 'error',
];

function updateMatch(al, patch) {
  const db = getDb();
  db.prepare(`INSERT OR IGNORE INTO al_airbnb_matches (al_number, status) VALUES (?, 'pending')`).run(
    String(al)
  );
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!MATCH_COLUMNS.includes(k)) throw new Error(`unknown match column ${k}`);
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  if (!sets.length) return;
  vals.push(String(al));
  db.prepare(`UPDATE al_airbnb_matches SET ${sets.join(', ')} WHERE al_number = ?`).run(...vals);
}

// Pending ALs not yet tried by `step` ('bing' | 'google'), oldest import first.
function pendingAls(step, limit = 10000) {
  const col = step === 'google' ? 'google_tried' : 'bing_tried';
  return getDb()
    .prepare(
      `SELECT m.al_number AS al FROM al_airbnb_matches m
         JOIN al_registry r ON r.al_number = m.al_number
        WHERE m.status = 'pending' AND m.${col} = 0
        ORDER BY r.imported_at ASC, m.al_number DESC
        LIMIT ?`
    )
    .all(limit)
    .map((r) => r.al);
}

// Found matches whose host was never read (e.g. seeded or dossier-less).
function matchesMissingHost() {
  return getDb()
    .prepare(
      `SELECT al_number AS al, room_id AS roomId FROM al_airbnb_matches
        WHERE status = 'found' AND room_id IS NOT NULL AND host_id IS NULL`
    )
    .all();
}

// Every (registry AL → dossier listing) pair, best row first per AL:
// live listings before removed ones, newest dossier first.
function dossierRowsForRegistry() {
  return getDb()
    .prepare(
      `SELECT r.al_number AS al, hr.job_id AS jobId, hr.listing_url AS listingUrl,
              json_extract(hr.result_json, '$.title') AS title,
              COALESCE(json_extract(hr.result_json, '$.removed'), 0) AS removed,
              hm.host_id AS hostId, hm.host_url AS hostUrl, hm.host_name AS hostName,
              j.created_at AS createdAt
         FROM host_results hr
         JOIN al_registry r
           ON r.al_number = CAST(json_extract(hr.result_json, '$.alNumber') AS TEXT)
         JOIN host_meta hm ON hm.job_id = hr.job_id
         JOIN jobs j ON j.id = hr.job_id
        WHERE hr.status = 'done'
        ORDER BY r.al_number, removed ASC, j.created_at DESC`
    )
    .all();
}

// Every AL any host dossier shows becomes a registry row too, so the registry
// is the union of imported RNAL exports and everything the dossiers already
// know. Name/address/capacity come from the cached RNT record (al_licenses).
// Rows from a real RNAL import are never overwritten (INSERT OR IGNORE); a
// later import of the same AL takes the row over with its own source file.
const DOSSIER_SOURCE = 'Host dossiers';

function importFromDossiers() {
  const db = getDb();
  const missing = db
    .prepare(
      `SELECT DISTINCT CAST(json_extract(hr.result_json, '$.alNumber') AS TEXT) AS al,
              l.rnt_json AS rnt
         FROM host_results hr
         LEFT JOIN al_licenses l
           ON l.al_number = CAST(json_extract(hr.result_json, '$.alNumber') AS TEXT)
        WHERE hr.status = 'done'
          AND json_extract(hr.result_json, '$.alNumber') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM al_registry r
             WHERE r.al_number = CAST(json_extract(hr.result_json, '$.alNumber') AS TEXT))`
    )
    .all();
  if (!missing.length) return 0;

  const insert = db.prepare(
    `INSERT OR IGNORE INTO al_registry (al_number, name, registered_at, modalidade, camas,
                                        utentes, quartos, address, postal_code, localidade,
                                        freguesia, concelho, source_file, imported_at)
     VALUES (@al, @name, @registeredAt, @modalidade, @camas, @utentes, @quartos, @address,
             @postalCode, @localidade, @freguesia, @concelho, @source, @ts)`
  );
  const openMatch = db.prepare(
    `INSERT OR IGNORE INTO al_airbnb_matches (al_number, status) VALUES (?, 'pending')`
  );
  const ts = nowSec();
  let added = 0;
  const tx = db.transaction(() => {
    for (const { al, rnt: raw } of missing) {
      if (!cleanAl(al)) continue;
      let rnt = {};
      try {
        rnt = raw ? JSON.parse(raw) : {};
      } catch {
        rnt = {};
      }
      const found = rnt.status === 'found';
      const a = (found && rnt.address) || {};
      const c = (found && rnt.capacity) || {};
      insert.run({
        al,
        name: (found && rnt.name) || null,
        registeredAt: (found && rnt.registeredAt) || null,
        modalidade: (found && rnt.modalidade) || null,
        camas: c.camas ?? null,
        utentes: c.utentes ?? null,
        quartos: c.quartos ?? null,
        address: a.full || null,
        postalCode: a.postalCode || null,
        localidade: a.localidade || null,
        freguesia: a.freguesia || null,
        concelho: a.concelho || null,
        source: DOSSIER_SOURCE,
        ts,
      });
      openMatch.run(al);
      added++;
    }
  });
  tx();
  return added;
}

// Step 0 / Step 3: match every open registry AL against the host dossiers.
// Free — no browser, no search. Returns the ALs that changed.
function matchFromDossiers() {
  importFromDossiers();
  const best = new Map();
  for (const row of dossierRowsForRegistry()) {
    if (!best.has(row.al)) best.set(row.al, row);
  }
  const changed = [];
  const db = getDb();
  const tx = db.transaction(() => {
    for (const [al, row] of best) {
      const m = getMatch(al);
      const hostFields = {
        host_id: row.hostId || null,
        host_url: row.hostUrl || null,
        host_name: row.hostName || null,
      };
      if (m && m.status === 'found') {
        // Already found by a search: only fill a missing host.
        if (!m.host_id && row.hostId && roomIdOf(row.listingUrl) === m.room_id) {
          updateMatch(al, hostFields);
          changed.push(al);
        }
        continue;
      }
      if (m && !OPEN_STATUSES.includes(m.status)) continue;
      const removed = Number(row.removed) === 1;
      if (removed && m && m.status === 'delisted') continue;
      updateMatch(al, {
        status: removed ? 'delisted' : 'found',
        found_via: 'host_dossier',
        room_id: roomIdOf(row.listingUrl),
        listing_url: row.listingUrl,
        listing_title: row.title || null,
        ...hostFields,
        checked_at: nowSec(),
        error: null,
      });
      changed.push(al);
    }
  });
  tx();
  return changed;
}

// Step 2: hosts behind found matches that have no dossier at all and no
// queued/running host job. Every host counts — no minimum listing count.
// Hosts that already have a dossier are left to the tracker (count checks +
// host-sync keep them current); re-running full dossiers would mean hours of
// redundant Airbnb traffic once the dossier ALs are in the registry.
function hostsToExpand() {
  const db = getDb();
  const hosts = db
    .prepare(
      `SELECT host_id AS hostId, MAX(host_url) AS hostUrl, MAX(host_name) AS hostName,
              COUNT(*) AS registryListings
         FROM al_airbnb_matches
        WHERE status = 'found' AND host_id IS NOT NULL
        GROUP BY host_id`
    )
    .all();
  const hasDossier = db.prepare(
    `SELECT 1 FROM jobs j JOIN host_meta hm ON hm.job_id = j.id
      WHERE j.type = 'host' AND hm.host_id = ?
        AND j.status IN ('queued','running','done')
      LIMIT 1`
  );
  const queuedByUrl = db.prepare(
    `SELECT 1 FROM jobs WHERE type = 'host' AND status IN ('queued','running')
        AND urls_json LIKE ? LIMIT 1`
  );
  return hosts.filter(
    (h) => !hasDossier.get(h.hostId) && !queuedByUrl.get(`%/users/profile/${h.hostId}"%`)
  );
}

// --- Read model for the UI -----------------------------------------------------

function listRegistry({ sourceFile = null } = {}) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, m.status, m.found_via, m.room_id, m.listing_url, m.listing_title,
              m.host_id, m.host_url, m.host_name, m.bing_tried, m.google_tried,
              m.checked_at, m.error
         FROM al_registry r
         LEFT JOIN al_airbnb_matches m ON m.al_number = r.al_number
        ${sourceFile ? 'WHERE r.source_file = ?' : ''}
        ORDER BY r.registered_at DESC, r.al_number DESC`
    )
    .all(...(sourceFile ? [sourceFile] : []));

  // Dossier per host (latest done host job) + dossier rooms per AL for the
  // mismatch flag.
  const dossierByHost = new Map(
    db
      .prepare(
        `SELECT hm.host_id AS hostId, j.id AS jobId, MAX(j.created_at) AS createdAt,
                j.status AS status
           FROM jobs j JOIN host_meta hm ON hm.job_id = j.id
          WHERE j.type = 'host' AND hm.host_id IS NOT NULL
          GROUP BY hm.host_id`
      )
      .all()
      .map((d) => [d.hostId, d])
  );
  const activeHostJobs = new Set(
    db
      .prepare(`SELECT urls_json FROM jobs WHERE type = 'host' AND status IN ('queued','running')`)
      .all()
      .map((r) => (r.urls_json.match(/\/users\/profile\/(\d+)/) || [])[1])
      .filter(Boolean)
  );
  const dossierRooms = new Map();
  for (const d of dossierRowsForRegistry()) {
    if (Number(d.removed) === 1) continue;
    const set = dossierRooms.get(d.al) || new Set();
    set.add(roomIdOf(d.listingUrl));
    dossierRooms.set(d.al, set);
  }

  return rows.map((r) => {
    const dossier = r.host_id ? dossierByHost.get(r.host_id) : null;
    const rooms = dossierRooms.get(r.al_number);
    return {
      alNumber: r.al_number,
      name: r.name,
      registeredAt: r.registered_at,
      modalidade: r.modalidade,
      utentes: r.utentes,
      quartos: r.quartos,
      address: r.address,
      postalCode: r.postal_code,
      localidade: r.localidade,
      freguesia: r.freguesia,
      sourceFile: r.source_file,
      status: r.status || 'pending',
      foundVia: r.found_via,
      roomId: r.room_id,
      listingUrl: r.listing_url,
      listingTitle: r.listing_title,
      hostId: r.host_id,
      hostUrl: r.host_url,
      hostName: r.host_name,
      bingTried: !!r.bing_tried,
      googleTried: !!r.google_tried,
      checkedAt: r.checked_at,
      error: r.error,
      dossierJobId: dossier?.jobId || null,
      hostJobActive: !!(r.host_id && activeHostJobs.has(r.host_id)),
      mismatch: !!(r.status === 'found' && r.room_id && rooms && !rooms.has(r.room_id)),
    };
  });
}

function registrySources() {
  return getDb()
    .prepare(
      `SELECT source_file AS sourceFile, COUNT(*) AS rows, MAX(imported_at) AS importedAt
         FROM al_registry GROUP BY source_file ORDER BY importedAt DESC`
    )
    .all();
}

// Resets an AL so the pipeline searches it again (explicit user action only)
// — including its cached search answers, so a recheck really asks again.
function resetMatch(al) {
  getDb().prepare(`DELETE FROM al_search_cache WHERE al_number = ?`).run(String(al));
  updateMatch(al, {
    status: 'pending',
    found_via: null,
    room_id: null,
    listing_url: null,
    listing_title: null,
    host_id: null,
    host_url: null,
    host_name: null,
    bing_tried: 0,
    google_tried: 0,
    checked_at: null,
    error: null,
  });
}

// --- Search cache / usage / provider state ------------------------------------

function cacheGet(al, provider) {
  const row = getDb()
    .prepare(`SELECT * FROM al_search_cache WHERE al_number = ? AND provider = ?`)
    .get(String(al), provider);
  return row ? { query: row.query, results: JSON.parse(row.results_json), ts: row.ts } : null;
}

function cachePut(al, provider, query, results) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO al_search_cache (al_number, provider, query, results_json, ts)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(String(al), provider, query, JSON.stringify(results), nowSec());
}

function logUsage({ provider, al = null, cost = 0, results = null, status }) {
  getDb()
    .prepare(
      `INSERT INTO search_usage (provider, al_number, ts, cost, results, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(provider, al, nowSec(), cost, results, status);
}

function usageByProvider() {
  const map = new Map();
  for (const r of getDb()
    .prepare(
      `SELECT provider, COUNT(*) AS calls, SUM(cost) AS cost,
              SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok,
              MAX(ts) AS lastTs
         FROM search_usage GROUP BY provider`
    )
    .all()) {
    map.set(r.provider, r);
  }
  return map;
}

function getProviderState(provider) {
  return (
    getDb().prepare(`SELECT * FROM search_provider_state WHERE provider = ?`).get(provider) || null
  );
}

function setProviderState(provider, patch) {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO search_provider_state (provider, updated_at) VALUES (?, ?)`
  ).run(provider, nowSec());
  const allowed = [
    'key_fingerprint', 'exhausted_until', 'last_error', 'validated_at', 'validation_error',
    'last_remaining',
  ];
  const sets = ['updated_at = ?'];
  const vals = [nowSec()];
  for (const [k, v] of Object.entries(patch)) {
    if (!allowed.includes(k)) throw new Error(`unknown provider state column ${k}`);
    sets.push(`${k} = ?`);
    vals.push(v);
  }
  vals.push(provider);
  db.prepare(`UPDATE search_provider_state SET ${sets.join(', ')} WHERE provider = ?`).run(...vals);
}

function hasActiveJob(type) {
  return !!getDb()
    .prepare(`SELECT 1 FROM jobs WHERE type = ? AND status IN ('queued','running') LIMIT 1`)
    .get(type);
}

function activeJobs() {
  return getDb()
    .prepare(
      `SELECT id, type, status, created_at AS createdAt FROM jobs
        WHERE type IN ('al-registry','al-google') AND status IN ('queued','running')
        ORDER BY created_at ASC`
    )
    .all();
}

module.exports = {
  cleanAl,
  roomIdOf,
  importRows,
  getMatch,
  updateMatch,
  pendingAls,
  matchesMissingHost,
  matchFromDossiers,
  importFromDossiers,
  DOSSIER_SOURCE,
  hostsToExpand,
  listRegistry,
  registrySources,
  resetMatch,
  cacheGet,
  cachePut,
  logUsage,
  usageByProvider,
  getProviderState,
  setProviderState,
  hasActiveJob,
  activeJobs,
};
