const express = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');

const store = require('../jobs/jobStore');
const scheduler = require('../jobs/scheduler');
const { emit } = require('../jobs/jobManager');
const { normalizeAirbnbUrl } = require('../lib/urlNormalize');

const router = express.Router();

const CreateBody = z.object({
  urls: z.array(z.string().min(1)).min(1).max(15),
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional().default(''),
});

router.post('/jobs', (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues });
  }

  let normalized;
  try {
    normalized = Array.from(new Set(parsed.data.urls.map((u) => normalizeAirbnbUrl(u))));
  } catch (err) {
    return res.status(400).json({ error: 'invalid-url', message: err.message });
  }
  if (normalized.length === 0) return res.status(400).json({ error: 'no-valid-urls' });

  const id = nanoid(10);
  const name = parsed.data.name.trim();
  const location = (parsed.data.location || '').trim();

  store.createJob({ id, urls: normalized, name, location });
  emit(id, 'job-created', {
    jobId: id,
    urls: normalized,
    name,
    location,
    createdAt: Math.floor(Date.now() / 1000),
  });
  scheduler.kick();

  const job = store.getJob(id);
  return res.status(201).json({ jobId: id, job });
});

router.get('/jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
  const jobs = store.listJobs(limit);
  return res.json({ jobs });
});

router.get('/jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not-found' });
  const listings = store.listingResults(req.params.id);
  return res.json({ job, listings });
});

router.get('/jobs/:id/events', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not-found' });
  return res.json({
    job,
    events: store.eventsForJob(req.params.id),
    attempts: store.scrapeAttemptsForJob(req.params.id),
  });
});

router.get('/metrics', (req, res) => {
  const window = Math.min(parseInt(req.query.windowDays, 10) || 7, 90) * 86400;
  const m = store.globalMetrics({ windowSeconds: window });

  const totalAttempts = m.byOutcome.reduce((acc, r) => acc + r.n, 0);
  const byOutcome = Object.fromEntries(m.byOutcome.map((r) => [r.outcome, r.n]));
  const success = (byOutcome['success'] || 0) + (byOutcome['success-shrunk'] || 0);

  const durations = m.jobsCompleted
    .map((j) => (j.finishedAt - j.startedAt) * 1000)
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b);

  const p50 = durations.length ? durations[Math.floor(durations.length * 0.5)] : null;
  const p95 = durations.length ? durations[Math.floor(durations.length * 0.95)] : null;
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  return res.json({
    windowDays: window / 86400,
    totalAttempts,
    byOutcome,
    successRate: totalAttempts ? success / totalAttempts : null,
    shrinkRate: totalAttempts ? (byOutcome['success-shrunk'] || 0) / totalAttempts : null,
    priceFoundRate: totalAttempts ? success / totalAttempts : null,
    cache: {
      hits: m.cacheStats.cached || 0,
      total: m.cacheStats.total || 0,
      rate: m.cacheStats.total ? (m.cacheStats.cached || 0) / m.cacheStats.total : null,
    },
    jobDurationMs: { count: durations.length, avg, p50, p95 },
  });
});

router.post('/jobs/:id/cancel', (req, res) => {
  const result = scheduler.cancel(req.params.id);
  if (!result.ok) return res.status(409).json({ error: result.reason });
  return res.json({ ok: true });
});

router.delete('/jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'not-found' });
  if (job.status === 'running' || job.status === 'queued') {
    return res.status(409).json({ error: 'job-active' });
  }
  store.deleteJob(req.params.id);
  emit(req.params.id, 'deleted', { jobId: req.params.id });
  return res.json({ ok: true });
});

module.exports = router;
