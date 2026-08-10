const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

let db = null;

function open() {
  if (db) return db;

  const dbPath = path.resolve(__dirname, '..', process.env.DB_PATH || './data.sqlite');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  runMigrations(db);

  return db;
}

function runMigrations(db) {
  // Idempotent ALTERs for columns added after the initial schema.
  // Use try/catch because SQLite raises "duplicate column name" when the
  // column already exists — there's no IF NOT EXISTS for ADD COLUMN.
  const adds = [
    `ALTER TABLE listings ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE jobs ADD COLUMN name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE jobs ADD COLUMN location TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE jobs ADD COLUMN type TEXT NOT NULL DEFAULT 'adr'`,
    `ALTER TABLE tracked_hosts ADD COLUMN manual_nif TEXT`,
  ];
  for (const stmt of adds) {
    try {
      db.exec(stmt);
    } catch (err) {
      if (!/duplicate column name/i.test(err.message)) throw err;
    }
  }

  backfillHostSnapshots(db);
}

const PROFILE_ID_RE = /\/users\/(?:profile|show)\/(\d+)/i;

// One-shot seed of host_snapshots + tracked_hosts from pre-existing host jobs,
// so evolution charts have a starting point. Guarded by table emptiness so it
// never duplicates rows on later boots.
function backfillHostSnapshots(db) {
  const empty = db.prepare(`SELECT COUNT(*) AS c FROM host_snapshots`).get().c === 0;
  if (!empty) return;

  const rows = db
    .prepare(
      `SELECT hm.job_id, hm.host_id, hm.host_url, hm.host_name, hm.listings_count,
              hm.updated_at, j.finished_at, j.urls_json
         FROM host_meta hm
         JOIN jobs j ON j.id = hm.job_id
        WHERE hm.listings_count IS NOT NULL
        ORDER BY hm.updated_at ASC`
    )
    .all();

  const insertSnap = db.prepare(
    `INSERT INTO host_snapshots (host_id, ts, listings_count, source, job_id)
     VALUES (?, ?, ?, 'backfill', ?)`
  );
  const insertTracked = db.prepare(
    `INSERT INTO tracked_hosts (host_id, host_url, host_name, enabled, created_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(host_id) DO UPDATE SET
       host_url = excluded.host_url,
       host_name = COALESCE(excluded.host_name, tracked_hosts.host_name)`
  );

  const run = db.transaction(() => {
    for (const row of rows) {
      let hostId = row.host_id;
      let hostUrl = row.host_url;
      if (!hostId || !hostUrl) {
        try {
          const url = JSON.parse(row.urls_json || '[]')[0] || row.host_url;
          const m = url && url.match(PROFILE_ID_RE);
          if (m) {
            hostId = hostId || m[1];
            hostUrl = hostUrl || url;
          }
        } catch {
          /* unparseable urls_json — skip below */
        }
      }
      if (!hostId || !hostUrl) continue;
      const ts = row.finished_at || row.updated_at;
      insertSnap.run(hostId, ts, row.listings_count, row.job_id);
      insertTracked.run(hostId, hostUrl, row.host_name, ts);
    }
  });
  run();
}

function getDb() {
  if (!db) open();
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { open, getDb, close };
