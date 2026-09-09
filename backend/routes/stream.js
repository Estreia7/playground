const express = require('express');
const store = require('../jobs/jobStore');
const { onEvent } = require('../jobs/jobManager');

const router = express.Router();

router.get('/jobs/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  function send(evt) {
    res.write(`id: ${evt.seq}\n`);
    res.write(`event: ${evt.type}\n`);
    res.write(`data: ${JSON.stringify(evt.payload)}\n\n`);
  }

  // Resume point. The browser's own Last-Event-ID wins on an automatic
  // reconnect; ?since= lets the client pin the position of the REST snapshot
  // it already applied, so a fresh connection replays only what it missed
  // instead of the entire event log (which would re-apply long-dead statuses).
  const headerSeq = parseInt(req.headers['last-event-id'], 10);
  const querySeq = parseInt(req.query.since, 10);
  const fromSeq = Number.isFinite(headerSeq) ? headerSeq : querySeq;
  if (Number.isFinite(fromSeq)) {
    const replay = store.eventsAfter(fromSeq);
    for (const r of replay) send({ seq: r.seq, type: r.type, payload: r.payload });
  }

  res.write(`retry: 3000\n\n`);

  const off = onEvent((evt) => send(evt));

  const ping = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(ping);
    off();
  });
});

module.exports = router;
