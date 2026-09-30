/* Rackets from Padelful (padelful.com), made fit for this app.

   Padelful reviews ~1700 rackets across seasons and rates each one out of 10,
   overall and on five axes, with the maker's list price (PVP, euros). This
   file holds the shapes the screens use and the pure logic around them —
   cleaning up the raw records, ordering a season's list, and reading the
   price history the server keeps — so it runs the same on the server, in the
   browser and in the tests.

   The raw records are loose: the rating is a string ("8.8"), the shape is
   "Tear" in the data but "Teardrop" in the docs, empty strings stand for
   unknown, and weight can be an empty array. Everything below turns those into
   numbers or nulls once, here. */

export const PADELFUL = "https://www.padelful.com";

export type Shape = "round" | "tear" | "diamond";
export type Sort = "rating" | "price" | "value";

export interface Ratings {
  power: number;
  control: number;
  rebound: number;
  maneuverability: number;
  sweetSpot: number;
}

export interface Racket {
  slug: string;
  /** The model without the brand or the year: "Shade", not "Star Vie Shade 2027". */
  name: string;
  brand: string;
  season: number;
  /** Maker's list price in euros; null when Padelful does not know it. */
  price: number | null;
  /** Overall, out of 10. */
  rating: number;
  /** The five axes. Null until the full record has been read. */
  ratings: Ratings | null;
  shape: Shape | null;
  feel: string | null;
  balance: string | null;
  game: string | null;
  /** Grams, [lightest, heaviest]. */
  weight: [number, number] | null;
  core: string | null;
  faces: string | null;
  /** Pros who play it. */
  players: string[];
  image: string | null;
  url: string;
}

/** A price the server saw in a given month ("2026-09"). */
export interface PricePoint {
  month: string;
  price: number;
}

export interface RacketWithHistory extends Racket {
  /** Oldest first, one point per change. Empty until a month has been recorded. */
  history: PricePoint[];
}

export interface SeasonResponse {
  season: number;
  rackets: RacketWithHistory[];
  /** When Padelful was last read for this season. */
  fetchedAt: string;
  /** "rest" is the whole catalogue; "mcp" the best of the season, read through
      Padelful's MCP server while its REST API is down. */
  source: "rest" | "mcp";
  /** Prices are still being read; ask again shortly. */
  incomplete?: boolean;
}

/* ── raw records ───────────────────────────────────────────── */

type Raw = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const abs = (v: unknown) => {
  const s = str(v);
  return s ? (s.startsWith("http") ? s : PADELFUL + (s.startsWith("/") ? "" : "/") + s) : null;
};

export function shapeOf(v: unknown): Shape | null {
  const s = str(v)?.toLowerCase();
  if (!s) return null;
  if (s.startsWith("round")) return "round";
  if (s.startsWith("tear") || s === "hybrid") return "tear";
  if (s.startsWith("diamond")) return "diamond";
  return null;
}

/** "Star Vie Shade 2027" by "Star Vie" in 2027 → "Shade", and the year goes
    wherever it sits: "XPLO 2025 Di Nenno" → "XPLO Di Nenno". */
export function displayName(model: string, brand: string, season: number): string {
  let s = model.trim();
  if (brand && s.toLowerCase().startsWith(brand.toLowerCase() + " ")) s = s.slice(brand.length + 1);
  s = s.replace(new RegExp("\\s*\\b" + season + "\\b"), "").replace(/\s+/g, " ").trim();
  return s || model;
}

/** A raw Padelful record (REST list, MCP search or MCP get_racket) → Racket.
    Null when it lacks what every screen needs: a slug, a season and a rating. */
export function normalize(raw: Raw): Racket | null {
  const slug = str(raw.slug);
  const season = num(raw.season);
  const rating = num(raw.rating);
  if (!slug || season === null || rating === null) return null;
  const brand = str(raw.brand) ?? "";
  const model = str(raw.model) ?? str(raw.title)?.replace(/\s+Review$/i, "") ?? slug;
  const r = (raw.ratings ?? null) as Raw | null;
  const axes = r && ["power", "control", "rebound", "maneuverability", "sweetSpot"].map((k) => num(r[k]));
  const w = Array.isArray(raw.weight) ? raw.weight.map(num) : [];
  const m = (raw.materials ?? {}) as Raw;
  const price = num(raw.pvp);
  return {
    slug,
    name: displayName(model, brand, season),
    brand,
    season,
    price: price !== null && price > 0 ? price : null,
    rating,
    ratings:
      axes && axes.every((x) => x !== null)
        ? { power: axes[0]!, control: axes[1]!, rebound: axes[2]!, maneuverability: axes[3]!, sweetSpot: axes[4]! }
        : null,
    shape: shapeOf(raw.shape),
    feel: str(raw.feel),
    balance: str(raw.balance),
    game: str(raw.game),
    weight: w.length >= 1 && w[0] !== null ? [w[0], w[w.length - 1] ?? w[0]] : null,
    core: str(m.core),
    faces: str(m.faces),
    players: Array.isArray(raw.players) ? raw.players.filter((p): p is string => typeof p === "string") : [],
    // Recommendations leave the image out; every record follows this pattern.
    image: abs(raw.image) ?? `${PADELFUL}/images/rackets/${slug}.png`,
    url: abs(raw.url) ?? `${PADELFUL}/en/rackets/${slug}`,
  };
}

/** A search result knows less than a full record; keep whatever each has. */
export function merge(summary: Racket, full: Racket | null): Racket {
  if (!full) return summary;
  return { ...summary, ...full, image: full.image ?? summary.image, shape: full.shape ?? summary.shape };
}

/* ── ordering ──────────────────────────────────────────────── */

/** Rating points above a decent racket (7.5) per euro. A 9.0 at €210 beats an
    8.0 at €100, and a 7.5 at €40 is worth nothing extra: being cheap is not
    value on its own. */
export function value(r: Racket): number {
  return r.price ? Math.max(0, r.rating - 7.5) / r.price : 0;
}

export interface Filter {
  shape?: Shape | null;
  maxPrice?: number | null;
  sort?: Sort;
}

export function arrange<T extends Racket>(rackets: readonly T[], f: Filter): T[] {
  const sort = f.sort ?? "rating";
  const out = rackets.filter(
    (r) =>
      (!f.shape || r.shape === f.shape) &&
      (!f.maxPrice || (r.price !== null && r.price <= f.maxPrice)) &&
      (sort === "rating" || r.price !== null),
  );
  const byRating = (a: T, b: T) => b.rating - a.rating || (a.price ?? 1e9) - (b.price ?? 1e9);
  if (sort === "price") return out.sort((a, b) => (a.price as number) - (b.price as number) || b.rating - a.rating);
  if (sort === "value") return out.sort((a, b) => value(b) - value(a) || byRating(a, b));
  return out.sort(byRating);
}

/* ── price history ─────────────────────────────────────────── */

export type Snapshots = Record<string, Record<string, number>>;

export const monthOf = (iso: string) => iso.slice(0, 7);

/** A racket's price across the recorded months, one point per change. */
export function historyOf(slug: string, snapshots: Snapshots): PricePoint[] {
  const out: PricePoint[] = [];
  for (const month of Object.keys(snapshots).sort()) {
    const price = snapshots[month][slug];
    if (price === undefined) continue;
    if (out.length === 0 || out[out.length - 1].price !== price) out.push({ month, price });
  }
  return out;
}

/** Seasons worth offering: the first Padelful covers up to next year's models,
    which arrive in the autumn. */
export function seasonsFor(now: Date): number[] {
  const out: number[] = [];
  for (let y = now.getFullYear() + 1; y >= 2021; y--) out.push(y);
  return out;
}
