// Extract the HOST of a listing page the caller has already navigated to:
// the "Meet your host" card links to the host profile ("Go to Host full
// profile" → /users/profile/<id>), which is exactly the Host Analyzer input.
//
// Both host sections hydrate lazily near the bottom of the page, so we scroll
// first. MEET_YOUR_HOST sometimes never renders on a given visit; the
// HOST_OVERVIEW_DEFAULT block ("Hosted by …") links the same profile and is
// the fallback. Scoped to those sections on purpose: reviewer avatars and
// co-host cards elsewhere on the page also link /users/ profiles.

const HOST_ID_RE = /\/users\/(?:profile|show)\/(\d+)/i;
const SECTIONS = ['MEET_YOUR_HOST', 'HOST_OVERVIEW_DEFAULT'];

async function extractHost(page) {
  if (process.env.SCRAPER_STUB === '1') return { hostId: null, hostUrl: null, hostName: null };

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 2500).catch(() => {});
    await page.waitForTimeout(600);
  }
  await page
    .waitForSelector(SECTIONS.map((s) => `[data-section-id="${s}"]`).join(', '), { timeout: 15_000 })
    .catch(() => {});

  const found = await page
    .evaluate((sections) => {
      for (const sec of sections) {
        const el = document.querySelector(`[data-section-id="${sec}"]`);
        if (!el) continue;
        // The card also links co-hosts ("Learn more about the host, Luis."):
        // the primary host is the "Go to Host full profile" anchor.
        const links = Array.from(el.querySelectorAll('a[href*="/users/"]'));
        const a =
          links.find((l) => /host full profile/i.test(l.getAttribute('aria-label') || '')) || links[0];
        if (!a) continue;
        // "Meet your host\nPaulo Sousa\nStarted hosting…" / "Hosted by Paulo".
        const lines = (el.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);
        let name = null;
        const hosted = lines.find((l) => /^Hosted by\s+/i.test(l));
        if (hosted) name = hosted.replace(/^Hosted by\s+/i, '');
        else if (/^Meet your host$/i.test(lines[0] || '')) name = lines[1] || null;
        return { href: a.href, name, section: sec };
      }
      return null;
    }, SECTIONS)
    .catch(() => null);

  const m = found?.href?.match(HOST_ID_RE);
  if (!m) return { hostId: null, hostUrl: null, hostName: null };
  return {
    hostId: m[1],
    hostUrl: `https://www.airbnb.com/users/profile/${m[1]}`,
    hostName: found.name && found.name.length < 80 ? found.name : null,
  };
}

module.exports = { extractHost, HOST_ID_RE };
