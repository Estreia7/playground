// Collect the first ~5 gallery photos of a listing page (already navigated)
// and download them to backend/media/<listingId>/ so previews keep working
// after Airbnb's CDN URLs rot. Served read-only at /api/media/*.

const fs = require('fs');
const path = require('path');
const logger = require('../lib/logger');

const MAX_PHOTOS = 5;
const MAX_BYTES = 800 * 1024;
const MEDIA_ROOT = path.resolve(__dirname, '..', 'media');

function listingIdFromUrl(url) {
  const m = String(url).match(/\/rooms\/(\d+)/);
  return m ? m[1] : null;
}

async function collectPhotoUrls(page) {
  return page
    .evaluate((max) => {
      const urls = [];
      const seen = new Set();

      function push(raw) {
        if (!raw || urls.length >= max) return;
        // Normalize: keep the base image, pin a sane width for storage.
        const base = raw.split('?')[0];
        if (seen.has(base)) return;
        if (!/muscache\.com\/im\/pictures/i.test(raw)) return;
        seen.add(base);
        urls.push(`${base}?im_w=960`);
      }

      const og = document.querySelector('meta[property="og:image"]');
      if (og) push(og.getAttribute('content'));

      for (const img of document.querySelectorAll('img')) {
        push(img.currentSrc || img.src);
        if (urls.length >= max) break;
      }
      return urls;
    }, MAX_PHOTOS)
    .catch(() => []);
}

async function downloadPhotos(urls, listingUrl, signal) {
  const listingId = listingIdFromUrl(listingUrl);
  if (!listingId || urls.length === 0) return [];

  const dir = path.join(MEDIA_ROOT, listingId);
  fs.mkdirSync(dir, { recursive: true });

  const saved = [];
  for (let i = 0; i < urls.length && saved.length < MAX_PHOTOS; i++) {
    if (signal?.aborted) break;
    try {
      const res = await fetch(urls[i], {
        signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          Referer: 'https://www.airbnb.com/',
        },
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES * 4) continue;

      const type = res.headers.get('content-type') || '';
      const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
      const file = `${saved.length + 1}.${ext}`;
      fs.writeFileSync(path.join(dir, file), buf);
      saved.push(`${listingId}/${file}`);
    } catch (err) {
      if (signal?.aborted) break;
      logger.warn(`photo download failed (${urls[i]}):`, err.message);
    }
  }
  return saved;
}

// One call per listing page visit. Returns relative media paths.
async function extractPhotos(page, listingUrl, signal) {
  if (process.env.SCRAPER_STUB === '1') return stubPhotos(listingUrl);
  const urls = await collectPhotoUrls(page);
  return downloadPhotos(urls, listingUrl, signal);
}

// Stub: write tiny SVG placeholders so the lightbox has something to show.
function stubPhotos(listingUrl) {
  const listingId = listingIdFromUrl(listingUrl) || 'stub';
  const dir = path.join(MEDIA_ROOT, listingId);
  fs.mkdirSync(dir, { recursive: true });
  const hues = [18, 160, 205];
  const saved = [];
  hues.forEach((h, i) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="hsl(${h},45%,38%)"/><text x="480" y="330" font-family="sans-serif" font-size="42" fill="#fff" text-anchor="middle">Stub photo ${i + 1} - ${listingId}</text></svg>`;
    const file = `${i + 1}.svg`;
    fs.writeFileSync(path.join(dir, file), svg);
    saved.push(`${listingId}/${file}`);
  });
  return saved;
}

module.exports = { extractPhotos, MEDIA_ROOT };
