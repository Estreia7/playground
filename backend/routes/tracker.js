const express = require('express');
const { z } = require('zod');

const store = require('../jobs/jobStore');
const tracker = require('../jobs/tracker');

const router = express.Router();

// Tracked hosts with their latest count + delta vs the previous snapshot.
router.get('/tracked-hosts', (_req, res) => {
  const hosts = store.listTrackedHosts().map((h) => ({
    hostId: h.hostId,
    hostUrl: h.hostUrl,
    hostName: h.hostName,
    enabled: h.enabled,
    manualNif: h.manualNif || null,
    createdAt: h.createdAt,
    lastCheckedAt: h.lastCheckedAt,
    latest: h.latestTs != null ? { ts: h.latestTs, count: h.latestCount } : null,
    delta:
      h.latestCount != null && h.previousCount != null ? h.latestCount - h.previousCount : null,
  }));
  return res.json({ hosts });
});

router.get('/host-snapshots', (req, res) => {
  const hostId = String(req.query.hostId || '').trim();
  if (!hostId) return res.status(400).json({ error: 'missing-hostId' });
  return res.json({ snapshots: store.hostSnapshots(hostId) });
});

const UpdateBody = z
  .object({
    enabled: z.boolean().optional(),
    manualNif: z.string().regex(/^\d{9}$/).nullable().optional(),
  })
  .refine((b) => b.enabled !== undefined || b.manualNif !== undefined, {
    message: 'nothing to update',
  });

router.post('/tracked-hosts/:hostId', (req, res) => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid-body', issues: parsed.error.issues });
  }
  if (parsed.data.enabled !== undefined) {
    store.setTrackedHostEnabled(req.params.hostId, parsed.data.enabled);
  }
  if (parsed.data.manualNif !== undefined) {
    store.setTrackedHostNif(req.params.hostId, parsed.data.manualNif);
  }
  return res.json({ ok: true });
});

// Manual trigger: enqueue a count check for every enabled host right now.
router.post('/tracker/run-now', (_req, res) => {
  const result = tracker.tick({ force: true });
  return res.json(result);
});

module.exports = router;
