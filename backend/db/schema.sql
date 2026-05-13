CREATE TABLE IF NOT EXISTS listings (
  url              TEXT PRIMARY KEY,
  last_analysed_at INTEGER NOT NULL,
  result_json      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_last_analysed ON listings(last_analysed_at);

CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  created_at   INTEGER NOT NULL,
  started_at   INTEGER,
  finished_at  INTEGER,
  status       TEXT NOT NULL,
  urls_json    TEXT NOT NULL
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
