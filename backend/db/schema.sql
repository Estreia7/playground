CREATE TABLE IF NOT EXISTS listings (
  url              TEXT PRIMARY KEY,
  last_analysed_at INTEGER NOT NULL,
  result_json      TEXT NOT NULL,
  schema_version   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_listings_last_analysed ON listings(last_analysed_at);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  finished_at  INTEGER,
  status       TEXT NOT NULL,
  urls_json    TEXT NOT NULL,
  name         TEXT NOT NULL DEFAULT '',
  location     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_jobs_status_created ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at);

CREATE TABLE IF NOT EXISTS job_events (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ts           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id);

CREATE TABLE IF NOT EXISTS listing_results (
  job_id      TEXT NOT NULL,
  url         TEXT NOT NULL,
  status      TEXT NOT NULL,
  result_json TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, url)
);

-- Per-job manual exclusions: a listing/month ADR cell the user hid because
-- the scraped value looked unrealistic. Excluded cells are greyed in the UI
-- and dropped from every average.
CREATE TABLE IF NOT EXISTS excluded_cells (
  job_id      TEXT NOT NULL,
  url         TEXT NOT NULL,
  month_index INTEGER NOT NULL,
  PRIMARY KEY (job_id, url, month_index)
);
CREATE INDEX IF NOT EXISTS idx_excluded_cells_job ON excluded_cells(job_id);

-- Host-analyzer: one row per listing discovered on a host profile.
-- result_json: { url, title, locationText, reviewsCount, reviewsScore,
--               alNumber, photos: [relPath], error }
CREATE TABLE IF NOT EXISTS host_results (
  job_id      TEXT NOT NULL,
  listing_url TEXT NOT NULL,
  status      TEXT NOT NULL,
  result_json TEXT NOT NULL,
  finished_at INTEGER NOT NULL,
  PRIMARY KEY (job_id, listing_url)
);

-- Host-analyzer: job-level snapshot of the scraped host profile plus links
-- to any ADR jobs spawned from this host job.
CREATE TABLE IF NOT EXISTS host_meta (
  job_id           TEXT PRIMARY KEY,
  host_url         TEXT NOT NULL,
  host_id          TEXT,
  host_name        TEXT,
  listings_count   INTEGER,
  adr_job_ids_json TEXT NOT NULL DEFAULT '[]',
  updated_at       INTEGER NOT NULL
);

-- RNT (Turismo de Portugal) registry cache, keyed by the bare AL number.
-- rnt_json holds the parsed registration (address, modalidade, capacity,
-- dates, owner, insurance) or { status: 'not-found' }.
CREATE TABLE IF NOT EXISTS al_licenses (
  al_number      TEXT PRIMARY KEY,
  fetched_at     INTEGER NOT NULL,
  rnt_json       TEXT NOT NULL,
  lat            REAL,
  lng            REAL,
  geocode_status TEXT NOT NULL DEFAULT 'pending'
);

-- Host-analyzer: time-series of declared listing counts per host
-- ("View all N listings" on the profile page). Append-only.
CREATE TABLE IF NOT EXISTS host_snapshots (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id        TEXT NOT NULL,
  ts             INTEGER NOT NULL,
  listings_count INTEGER NOT NULL,
  source         TEXT NOT NULL DEFAULT 'job',  -- 'job' | 'tracker' | 'backfill'
  job_id         TEXT
);
CREATE INDEX IF NOT EXISTS idx_host_snapshots_host_ts ON host_snapshots(host_id, ts);

-- Hosts the tracker bot follows. Auto-enrolled when a host job completes
-- its profile phase; the tracker re-reads the declared count periodically.
CREATE TABLE IF NOT EXISTS tracked_hosts (
  host_id         TEXT PRIMARY KEY,
  host_url        TEXT NOT NULL,
  host_name       TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  last_checked_at INTEGER
);

-- Host-analyzer: per-host log of listings appearing/disappearing, written by
-- the tracker's sync jobs. Powers the dossier "portfolio changes" timeline.
CREATE TABLE IF NOT EXISTS host_listing_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  host_id     TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  listing_url TEXT NOT NULL,
  event       TEXT NOT NULL,  -- 'added' | 'removed'
  title       TEXT,
  ts          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_host_listing_events_host ON host_listing_events(host_id, ts);

CREATE TABLE IF NOT EXISTS scrape_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT NOT NULL,
  url           TEXT NOT NULL,
  month         TEXT NOT NULL,
  sample_start  TEXT NOT NULL,
  sample_end    TEXT NOT NULL,
  sample_nights INTEGER NOT NULL,
  outcome       TEXT NOT NULL,
  total_price   REAL,
  duration_ms   INTEGER NOT NULL,
  ts            INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_ts ON scrape_attempts(ts);
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_job ON scrape_attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_scrape_attempts_outcome ON scrape_attempts(outcome);

-- Per-job manual ADR overrides: a listing/month cell whose scraped price the
-- user replaced by hand. The scraped value stays in listing_results so the
-- override is always revertible; `value` is what every average and the export
-- actually use.
CREATE TABLE IF NOT EXISTS adr_overrides (
  job_id      TEXT NOT NULL,
  url         TEXT NOT NULL,
  month_index INTEGER NOT NULL,
  value       REAL NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (job_id, url, month_index)
);
CREATE INDEX IF NOT EXISTS idx_adr_overrides_job ON adr_overrides(job_id);

-- AL Registry: RNAL export rows the user imports (one row per AL number).
-- Matched against Airbnb in two directions — AL → listing → host (search +
-- verify) and host → listings → AL (host dossiers) — see al_airbnb_matches.
CREATE TABLE IF NOT EXISTS al_registry (
  al_number     TEXT PRIMARY KEY,
  name          TEXT,
  registered_at TEXT,
  modalidade    TEXT,
  camas         INTEGER,
  utentes       INTEGER,
  quartos       INTEGER,
  address       TEXT,
  postal_code   TEXT,
  localidade    TEXT,
  freguesia     TEXT,
  concelho      TEXT,
  source_file   TEXT,
  imported_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_al_registry_source ON al_registry(source_file);

-- One row per registry AL: where it stands on Airbnb.
--   status    pending | found | delisted | not_found | error
--   found_via host_dossier | bing | google
-- delisted = a search engine still indexes the listing but /rooms/<id> now
-- redirects away (removed/deactivated). bing_tried / google_tried make every
-- paid or slow step run at most once per AL unless explicitly reset.
CREATE TABLE IF NOT EXISTS al_airbnb_matches (
  al_number     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'pending',
  found_via     TEXT,
  room_id       TEXT,
  listing_url   TEXT,
  listing_title TEXT,
  host_id       TEXT,
  host_url      TEXT,
  host_name     TEXT,
  bing_tried    INTEGER NOT NULL DEFAULT 0,
  google_tried  INTEGER NOT NULL DEFAULT 0,
  checked_at    INTEGER,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS idx_al_matches_status ON al_airbnb_matches(status);
CREATE INDEX IF NOT EXISTS idx_al_matches_host ON al_airbnb_matches(host_id);

-- Raw search-engine answers per (AL, provider): re-filtering never re-spends.
CREATE TABLE IF NOT EXISTS al_search_cache (
  al_number    TEXT NOT NULL,
  provider     TEXT NOT NULL,
  query        TEXT NOT NULL,
  results_json TEXT NOT NULL,
  ts           INTEGER NOT NULL,
  PRIMARY KEY (al_number, provider)
);

-- Every paid search call (and its failures), for the credits panel.
CREATE TABLE IF NOT EXISTS search_usage (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  provider  TEXT NOT NULL,
  al_number TEXT,
  ts        INTEGER NOT NULL,
  cost      INTEGER NOT NULL DEFAULT 0,
  results   INTEGER,
  status    TEXT NOT NULL  -- ok | quota | auth | error | validation
);
CREATE INDEX IF NOT EXISTS idx_search_usage_provider ON search_usage(provider, ts);

-- Per-provider health: canary validation, exhaustion, last known balance.
-- key_fingerprint resets exhaustion/validation when the API key changes.
CREATE TABLE IF NOT EXISTS search_provider_state (
  provider         TEXT PRIMARY KEY,
  key_fingerprint  TEXT,
  exhausted_until  INTEGER,
  last_error       TEXT,
  validated_at     INTEGER,
  validation_error TEXT,
  last_remaining   INTEGER,
  updated_at       INTEGER NOT NULL
);
