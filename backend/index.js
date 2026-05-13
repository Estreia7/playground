require('dotenv').config();

const express = require('express');
const path = require('path');

const { open: openDb, close: closeDb } = require('./db');
const store = require('./jobs/jobStore');
const scheduler = require('./jobs/scheduler');
const { emit } = require('./jobs/jobManager');
const { runJob } = require('./workers/pool');
const logger = require('./lib/logger');

const jobsRouter = require('./routes/jobs');
const streamRouter = require('./routes/stream');

openDb();

const recovered = store.recoverInterruptedOnBoot();
if (recovered > 0) {
  logger.warn(`Recovered ${recovered} interrupted job(s) on boot`);
}

scheduler.setRunner(runJob);

const app = express();
app.use(express.json({ limit: '256kb' }));

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

const PORT = parseInt(process.env.PORT || '4001', 10);
const server = app.listen(PORT, '127.0.0.1', () => {
  logger.info(`airbnb-str-scrapper backend listening on http://127.0.0.1:${PORT}`);
  setImmediate(() => scheduler.kick());
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
