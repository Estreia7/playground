const express = require('express');
const { z } = require('zod');
const { nanoid } = require('nanoid');

const store = require('../jobs/jobStore');
const reg = require('../jobs/alRegistryStore');
const scheduler = require('../jobs/scheduler');
const { emit } = require('../jobs/jobManager');
const { providerStatus } = require('../lib/searchProviders');

const router = express.Router();

const GOOGLE_MAX_BATCH = 500;

function queueJob(type, urls, name) {
  const id = nanoid(10);
  store.createJob({ id, urls, name, type });
  emit(id, 'job-created', { jobId: id, type, urls, name, createdAt: Math.floor(Date.now() / 1000) });
  scheduler.kick();
  return id;
}

// Free steps (dossiers → hosts → Bing → host expansion). One at a time.
function queueRegistryRun() {
  if (reg.hasActiveJob('al-registry')) return null;
  return queueJob('al-registry', ['registry'], 'AL registry: free matching');
}

const Row = z.object({
  alNumber: z.union([z.string(), z.number()]).transform(String),
  name: z.string().nullish(),
  registeredAt: z.string().nullish(),
  modalidade: z.string().nullish(),
  camas: z.union([z.string(), z.number()]).nullish(),
  utentes: z.union([z.string(), z.number()]).nullish(),
  quartos: z.union([z.string(), z.number()]).nullish(),
  address: z.string().nullish(),
  postalCode: z.string().nullish(),
  localidade: z.string().nullish(),
  freguesia: z.string().nullish(),
  concelho: z.string().nullish(),
});

const ImportBody = z.object({
  sourceFile: z.string().trim().min(1).max(200),
  rows: z.array(Row).min(1).max(20000),
  autoRun: z.boolean().optional().default(true),
});

router.post('/al-registry/import', express.json({ limit: '10mb' }), (req, res) => {
  const parsed = ImportBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues.slice(0, 5) });
  }
  const { sourceFile, rows, autoRun } = parsed.data;
  const result = reg.importRows(rows, sourceFile);
  const matchedFromDossiers = reg.matchFromDossiers().length;
  const jobId = autoRun ? queueRegistryRun() : null;
  return res.status(201).json({ ...result, matchedFromDossiers, jobId });
});

router.get('/al-registry', (req, res) => {
  const source = req.query.source ? String(req.query.source) : null;
  const rows = reg.listRegistry({ sourceFile: source });
  const summary = {
    total: rows.length,
    found: 0,
    delisted: 0,
    notFound: 0,
    pending: 0,
    error: 0,
    byVia: { host_dossier: 0, bing: 0, google: 0 },
    pendingAfterBing: 0,
    hostsFound: new Set(rows.filter((r) => r.hostId).map((r) => r.hostId)).size,
    hostsWithDossier: new Set(rows.filter((r) => r.dossierJobId).map((r) => r.hostId)).size,
    mismatches: rows.filter((r) => r.mismatch).length,
  };
  for (const r of rows) {
    if (r.status === 'found') summary.found++;
    else if (r.status === 'delisted') summary.delisted++;
    else if (r.status === 'not_found') summary.notFound++;
    else if (r.status === 'error') summary.error++;
    else summary.pending++;
    if (r.status === 'found' && r.foundVia) summary.byVia[r.foundVia] = (summary.byVia[r.foundVia] || 0) + 1;
    if (r.status === 'pending' && r.bingTried && !r.googleTried) summary.pendingAfterBing++;
  }
  return res.json({
    rows,
    summary,
    sources: reg.registrySources(),
    activeJobs: reg.activeJobs(),
  });
});

router.get('/al-registry/providers', async (req, res) => {
  try {
    res.json(await providerStatus({ refresh: req.query.refresh === '1' }));
  } catch (err) {
    res.status(500).json({ error: 'provider-status-failed', message: err.message });
  }
});

router.post('/al-registry/run', (_req, res) => {
  const jobId = queueRegistryRun();
  if (!jobId) return res.status(409).json({ error: 'already-running' });
  return res.status(201).json({ jobId });
});

const GoogleBody = z.object({
  alNumbers: z.array(z.string()).max(GOOGLE_MAX_BATCH).optional(),
  limit: z.number().int().min(1).max(GOOGLE_MAX_BATCH).optional().default(10),
});

// Paid step — only ALs still pending after the free steps, never twice.
router.post('/al-registry/google', async (req, res) => {
  const parsed = GoogleBody.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues });
  }
  if (reg.hasActiveJob('al-google')) return res.status(409).json({ error: 'already-running' });

  const pendingSet = new Set(reg.pendingAls('google'));
  const als = (parsed.data.alNumbers || reg.pendingAls('google', parsed.data.limit))
    .map((a) => reg.cleanAl(a))
    .filter((a) => a && pendingSet.has(a))
    .slice(0, parsed.data.limit);
  if (!als.length) return res.status(409).json({ error: 'nothing-pending' });

  const { next, providers } = await providerStatus();
  if (!next) return res.status(409).json({ error: 'no-credits', providers });
  const nextState = providers.find((p) => p.name === next.name);
  const estimate = als.length * next.costPerQuery;

  // The chain falls through providers mid-batch, so only refuse when every
  // usable provider has a known balance and together they can't cover it.
  const usable = providers.filter((p) => p.configured && !p.exhaustedUntil && !p.validationError);
  if (usable.length && usable.every((p) => p.remaining != null)) {
    const capacity = usable.reduce((n, p) => n + Math.floor(p.remaining / p.costPerQuery), 0);
    if (capacity < als.length) {
      return res.status(409).json({ error: 'insufficient-credits', capacity, requested: als.length });
    }
  }

  const jobId = queueJob('al-google', als, `AL registry: Google search (${als.length})`);
  return res.status(201).json({
    jobId,
    alNumbers: als,
    estimate: { provider: next.name, cost: estimate, unit: next.unit, remaining: nextState?.remaining ?? null },
  });
});

// Explicit recheck: clears the match and its cached searches.
router.post('/al-registry/:al/recheck', (req, res) => {
  const al = reg.cleanAl(req.params.al);
  if (!al || !reg.getMatch(al)) return res.status(404).json({ error: 'not-found' });
  reg.resetMatch(al);
  return res.json({ ok: true, alNumber: al });
});

module.exports = router;
