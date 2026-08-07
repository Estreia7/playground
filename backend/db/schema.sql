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
