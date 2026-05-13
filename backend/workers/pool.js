const { processListing } = require('./listingWorker');
const logger = require('../lib/logger');

async function runJob(job, { signal }) {
  const poolSize = Math.max(1, parseInt(process.env.WORKER_POOL_SIZE || '3', 10));
  const urls = [...job.urls];
  let cursor = 0;
  let errored = false;

  function dequeue() {
    if (signal?.aborted) return null;
    if (cursor >= urls.length) return null;
    return urls[cursor++];
  }

  async function workerLoop(workerId) {
    while (true) {
      const url = dequeue();
      if (!url) return;
      try {
        await processListing({ jobId: job.id, url, workerId, signal });
      } catch (err) {
        if (signal?.aborted) return;
        errored = true;
        logger.error(`worker ${workerId} failed on ${url}:`, err);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(poolSize, urls.length); i++) {
    workers.push(workerLoop(i + 1));
  }
  await Promise.all(workers);

  return { cancelled: !!signal?.aborted, errored };
}

module.exports = { runJob };
