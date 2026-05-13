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
