function randomDelay(minMs = 3000, maxMs = 8000, signal) {
  const ms = Math.floor(Math.random() * (maxMs - minMs)) + minMs;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Aborted'));
    const t = setTimeout(() => {
      signal?.removeEventListener?.('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('Aborted'));
    };
    signal?.addEventListener?.('abort', onAbort, { once: true });
  });
}

module.exports = { randomDelay };
