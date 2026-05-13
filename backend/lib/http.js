// Reserved seam for proxy / UA rotation when a residential proxy pool is added.
// For v1, callers use the browser factory directly. Wire proxy support here later.

function getProxyConfig() {
  if (!process.env.HTTP_PROXY) return null;
  return { server: process.env.HTTP_PROXY };
}

module.exports = { getProxyConfig };
