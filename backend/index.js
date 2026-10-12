require('dotenv').config();

const express = require('express');
const path = require('path');

const { open: openDb, close: closeDb } = require('./db');
const store = require('./jobs/jobStore');
const scheduler = require('./jobs/scheduler');
const { emit } = require('./jobs/jobManager');
const { runJob } = require('./workers/pool');
const { runHostJob } = require('./workers/hostWorker');
const { runHostCountJob } = require('./workers/hostCountWorker');
const { runHostSyncJob } = require('./workers/hostSyncWorker');
const { runRegistryJob } = require('./workers/registryWorker');
const { runAlRegistryJob, runAlGoogleJob } = require('./workers/alRegistryWorker');
const alRegistry = require('./jobs/alRegistryStore');
const tracker = require('./jobs/tracker');
const { MEDIA_ROOT } = require('./scraper/extractPhotos');
const logger = require('./lib/logger');

const jobsRouter = require('./routes/jobs');
const hostJobsRouter = require('./routes/hostJobs');
const streamRouter = require('./routes/stream');
const trackerRouter = require('./routes/tracker');
const alRegistryRouter = require('./routes/alRegistry');

openDb();

const recovered = store.recoverInterruptedOnBoot();
if (recovered > 0) {
  logger.warn(`Recovered ${recovered} interrupted job(s) on boot`);
}

// After a host dossier is built or synced, its listings may carry AL numbers
// from the imported registry: match them for free (no search, no browser).
function rematchRegistry(job) {
  try {
    const changed = alRegistry.matchFromDossiers();
    if (changed.length) emit(job.id, 'al-registry', { jobId: job.id, phase: 'rematched', changed });
  } catch (err) {
    logger.warn('AL registry rematch failed:', err.message);
  }
}

scheduler.setRunner((job, opts) => {
  if (job.type === 'host') return runHostJob(job, opts).finally(() => rematchRegistry(job));
  if (job.type === 'host-count') return runHostCountJob(job, opts);
  if (job.type === 'host-sync') return runHostSyncJob(job, opts).finally(() => rematchRegistry(job));
  if (job.type === 'registry') return runRegistryJob(job, opts);
  if (job.type === 'al-registry') return runAlRegistryJob(job, opts);
  if (job.type === 'al-google') return runAlGoogleJob(job, opts);
  return runJob(job, opts);
});

const app = express();
// The AL registry import carries a whole RNAL export; it parses its own body.
const jsonSmall = express.json({ limit: '256kb' });
app.use((req, res, next) => (req.path === '/api/al-registry/import' ? next() : jsonSmall(req, res, next)));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    stub: process.env.SCRAPER_STUB === '1',
    tz: process.env.TZ || 'Europe/Lisbon',
    poolSize: parseInt(process.env.WORKER_POOL_SIZE || '3', 10),
  });
});

app.use('/api', streamRouter);
app.use('/api', jobsRouter);
app.use('/api', hostJobsRouter);
app.use('/api', trackerRouter);
app.use('/api', alRegistryRouter);
app.use('/api/media', express.static(MEDIA_ROOT, { fallthrough: false, maxAge: '30d' }));

const PORT = parseInt(process.env.PORT || '4001', 10);
const server = app.listen(PORT, '127.0.0.1', () => {
  logger.info(`airbnb-str-scrapper backend listening on http://127.0.0.1:${PORT}`);
  setImmediate(() => scheduler.kick());
  tracker.start();
});

function shutdown(reason) {
  logger.info(`Shutting down (${reason})`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException', err);
});
process.on('unhandledRejection', (err) => {
  logger.error('unhandledRejection', err);
});
