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

  const lastSeqHeader = req.headers['last-event-id'];
  const fromSeq = parseInt(lastSeqHeader, 10);
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
