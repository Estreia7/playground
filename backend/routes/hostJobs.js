const express = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');

const store = require('../jobs/jobStore');
const scheduler = require('../jobs/scheduler');
const { emit } = require('../jobs/jobManager');
const logger = require('../lib/logger');

const router = express.Router();

const PROFILE_RE = /^https?:\/\/(www\.)?airbnb\.[a-z.]+\/users\/(profile|show)\/(\d+)/i;
const ADR_MAX_URLS = 35;

function normalizeProfileUrl(raw) {
  const m = String(raw || '').trim().match(PROFILE_RE);
  if (!m) throw new Error(`Not an Airbnb host profile URL: ${raw}`);
  return `https://www.airbnb.com/users/profile/${m[3]}`;
}

const CreateBody = z.object({
  profileUrl: z.string().min(1),
  name: z.string().trim().min(1).max(120),
});

router.post('/host-jobs', (req, res) => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues });
  }

  let profileUrl;
  try {
    profileUrl = normalizeProfileUrl(parsed.data.profileUrl);
  } catch (err) {
    return res.status(400).json({ error: 'invalid-url', message: err.message });
  }

  const id = nanoid(10);
  const name = parsed.data.name.trim();
  store.createJob({ id, urls: [profileUrl], name, type: 'host' });
  emit(id, 'job-created', {
    jobId: id,
    type: 'host',
    urls: [profileUrl],
    name,
    createdAt: Math.floor(Date.now() / 1000),
  });
  scheduler.kick();

  return res.status(201).json({ jobId: id, job: store.getJob(id) });
});

router.get('/host-jobs', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 200);
  const jobs = store.listJobs(limit, 'host').map((job) => ({
    ...job,
    host: store.getHostMeta(job.id),
  }));
  return res.json({ jobs });
});

// Full detail: job + host meta + listings + RNT licenses + linked ADR results.
router.get('/host-jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.type !== 'host') return res.status(404).json({ error: 'not-found' });
  return res.json(assembleHostJob(job));
});

function assembleHostJob(job) {
  const host = store.getHostMeta(job.id);
  const listings = store.hostListingResults(job.id);

  const licenses = {};
  for (const l of listings) {
    if (!l.alNumber || licenses[l.alNumber]) continue;
    const entry = store.alLicenseLookup(l.alNumber, 365 * 10);
    if (entry) {
      licenses[l.alNumber] = {
        alNumber: entry.alNumber,
        rnt: entry.rnt,
        lat: entry.lat,
        lng: entry.lng,
        geocodeStatus: entry.geocodeStatus,
      };
    }
  }

  const adrJobs = (host?.adrJobIds || [])
    .map((adrId) => {
      const adrJob = store.getJob(adrId);
      if (!adrJob) return null;
      return { job: adrJob, listings: store.listingResults(adrId) };
    })
    .filter(Boolean);

  return { job, host, listings, licenses, adrJobs };
}

// Spawn ADR job(s) from this host's listings (chunked to the ADR URL cap).
router.post('/host-jobs/:id/adr', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.type !== 'host') return res.status(404).json({ error: 'not-found' });

  const host = store.getHostMeta(req.params.id);
  const listings = store.hostListingResults(req.params.id);
  const urls = listings.map((l) => l.url);
  if (urls.length === 0) return res.status(409).json({ error: 'no-listings' });

  const baseName = host?.hostName || job.name;
  const chunks = [];
  for (let i = 0; i < urls.length; i += ADR_MAX_URLS) chunks.push(urls.slice(i, i + ADR_MAX_URLS));

  const created = chunks.map((chunk, i) => {
    const adrId = nanoid(10);
    const name = chunks.length > 1 ? `${baseName} — ADR (${i + 1}/${chunks.length})` : `${baseName} — ADR`;
    store.createJob({ id: adrId, urls: chunk, name, location: job.name, type: 'adr' });
    emit(adrId, 'job-created', {
      jobId: adrId,
      urls: chunk,
      name,
      location: job.name,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return adrId;
  });

  const adrJobIds = store.addAdrJobIds(req.params.id, created);
  emit(req.params.id, 'host-adr-linked', { jobId: req.params.id, adrJobIds });
  scheduler.kick();

  return res.status(201).json({ adrJobIds });
});

// Cross-host aggregates for the acquisition funnel. Raw components only —
// the frontend owns the score weights so they stay tunable in one place.
router.get('/host-funnel', (_req, res) => {
  const hosts = store.allHostJobs().map(({ job, host, listings }) => {
    const scores = listings.map((l) => l.reviewsScore).filter((v) => v != null);
    const reviews = listings.map((l) => l.reviewsCount).filter((v) => v != null);

    const insurance = { valid: 0, expired: 0, none: 0, unknown: 0 };
    const ownerNifs = new Map();
    const concelhos = new Set();
    let licensed = 0;
    let companyListings = 0;

    for (const l of listings) {
      if (!l.alNumber) {
        insurance.unknown++;
        continue;
      }
      licensed++;
      const entry = store.alLicenseLookup(l.alNumber, 365 * 10);
      const rnt = entry?.rnt;
      if (!rnt || rnt.status !== 'found') {
        insurance.unknown++;
        continue;
      }
      insurance[rnt.insurance?.status || 'none']++;
      if (rnt.address?.concelho) concelhos.add(rnt.address.concelho);
      const owner = rnt.owners?.[0];
      if (owner?.nif) {
        ownerNifs.set(owner.nif, owner);
        if (String(owner.nif).startsWith('5')) companyListings++;
      }
    }

    // Avg ADR from linked ADR jobs, when any have run.
    let adrValues = [];
    for (const adrId of host?.adrJobIds || []) {
      for (const lr of store.listingResults(adrId)) {
        for (const m of lr.result || []) {
          if (m.adr != null) adrValues.push(m.adr);
        }
      }
    }

    return {
      jobId: job.id,
      status: job.status,
      createdAt: job.createdAt,
      name: job.name,
      hostName: host?.hostName || null,
      hostUrl: host?.hostUrl || null,
      listingsTotal: listings.length,
      licensed,
      unlicensed: listings.length - licensed,
      avgScore: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null,
      lowRatedShare: scores.length
        ? Math.round((scores.filter((s) => s < 4.5).length / scores.length) * 100) / 100
        : null,
      totalReviews: reviews.length ? reviews.reduce((a, b) => a + b, 0) : null,
      insurance,
      owners: Array.from(ownerNifs.values()).map((o) => ({ nif: o.nif, name: o.name })),
      companyListings,
      concelhos: Array.from(concelhos),
      avgAdr: adrValues.length
        ? Math.round((adrValues.reduce((a, b) => a + b, 0) / adrValues.length) * 100) / 100
        : null,
    };
  });

  return res.json({ hosts });
});

router.post('/host-jobs/:id/cancel', (req, res) => {
  const result = scheduler.cancel(req.params.id);
  if (!result.ok) return res.status(409).json({ error: result.reason });
  return res.json({ ok: true });
});

router.delete('/host-jobs/:id', (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.type !== 'host') return res.status(404).json({ error: 'not-found' });
  if (job.status === 'running' || job.status === 'queued') {
    return res.status(409).json({ error: 'job-active' });
  }
  store.deleteJob(req.params.id);
  emit(req.params.id, 'deleted', { jobId: req.params.id });
  return res.json({ ok: true });
});

// Render the print route with headless Chromium and stream back a PDF.
router.get('/host-jobs/:id/pdf', async (req, res) => {
  const job = store.getJob(req.params.id);
  if (!job || job.type !== 'host') return res.status(404).json({ error: 'not-found' });

  const base = process.env.PRINT_BASE_URL || 'http://127.0.0.1:3002';
  let browser = null;
  try {
    const { chromium } = require('playwright');
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.goto(`${base}/host-analyzer/print/${job.id}`, {
      waitUntil: 'networkidle',
      timeout: 60_000,
    });
    await page.waitForSelector('#print-ready', { timeout: 45_000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    });

    const host = store.getHostMeta(job.id);
    const slug = (host?.hostName || job.name || job.id).replace(/[^\w-]+/g, '-').slice(0, 60);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="host-analysis-${slug}.pdf"`,
    });
    return res.send(pdf);
  } catch (err) {
    logger.error('pdf generation failed', err);
    return res.status(500).json({ error: 'pdf-failed', message: err.message });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
});

module.exports = router;
