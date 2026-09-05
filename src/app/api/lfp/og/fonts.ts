/* Fonts for the share cards, fetched at request time and cached in memory.

   ImageResponse has a 500 KB bundle ceiling, so the card's typefaces cannot
   ship in the bundle. Google Fonts answers with TTF sources when the request
   carries NO browser user agent (a browser UA gets woff/woff2 instead), so
   the CSS is fetched bare. A failure here must never fail a card: the loader
   returns an empty list and the route then omits the fonts option, which
   keeps Satori's bundled sans — a plainer card, but a card. */

/** next/og types weight as a union of 100..900, not number; only the two
 *  weights the cards use are declared. */
type Weight = 500 | 600;

interface FontSpec {
  name: string;
  family: string;
  weight: Weight;
}

const SPECS: FontSpec[] = [
  { name: "Fraunces", family: "Fraunces:wght@600", weight: 600 },
  { name: "IBM Plex Mono", family: "IBM+Plex+Mono:wght@500", weight: 500 },
];

// Satori reads ttf, otf and woff; take whichever Google offered.
const SRC = /src:\s*url\(([^)]+\.(?:ttf|otf|woff))\)/;

export interface LoadedFont {
  name: string;
  data: ArrayBuffer;
  weight: Weight;
  style: "normal";
}

let cache: LoadedFont[] | null = null;
let inflight: Promise<LoadedFont[]> | null = null;

async function loadOne(spec: FontSpec): Promise<LoadedFont | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${spec.family}&display=swap`, {
      signal: AbortSignal.timeout(4000),
    }).then((r) => (r.ok ? r.text() : ""));
    const m = css.match(SRC);
    if (!m) return null;
    const data = await fetch(m[1], { signal: AbortSignal.timeout(4000) }).then((r) =>
      r.ok ? r.arrayBuffer() : null
    );
    if (!data) return null;
    return { name: spec.name, data, weight: spec.weight, style: "normal" };
  } catch {
    return null;
  }
}

export async function loadFonts(): Promise<LoadedFont[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = Promise.all(SPECS.map(loadOne)).then((list) => {
      const ok = list.filter((f): f is LoadedFont => f !== null);
      // Only cache a complete set; a partial one is retried next time.
      if (ok.length === SPECS.length) cache = ok;
      inflight = null;
      return ok;
    });
  }
  return inflight;
}
