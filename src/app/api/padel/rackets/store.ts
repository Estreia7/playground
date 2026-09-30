import { promises as fs } from "fs";
import path from "path";
import {
  historyOf,
  merge,
  monthOf,
  normalize,
  type Racket,
  type SeasonResponse,
  type Snapshots,
} from "../../../padel/rackets/catalog.ts";
import { getRacket, pool, restCatalogue, searchRackets } from "./padelful.ts";

/* Padelful's rackets, kept on the VPS disk (storage/padel/rackets, git-ignored).

   A season's list is read at most once a day. A visitor never waits on that
   refresh when there is anything saved: they get the saved list, and the new
   one is fetched behind them for the next visit. Only the very first look at a
   season waits.

   Every refresh also writes down each racket's price for the month. Padelful
   only knows today's price; these monthly snapshots are what lets the app say
   "was €180 in March" a year from now — the reason to keep coming back each
   season.

   How a season is read depends on which Padelful door is open:
   - REST: the whole catalogue in one call, every season at once.
   - MCP (REST down): search_rackets caps a search at 50 and returns an arbitrary
     50 when more match, so the season is searched brand by brand (each brand
     has well under 50 models a year). Searches carry the rating but not the
     price, so that list is saved and shown straight away, and the best
     MCP_DETAILS of the season are then read in full with get_racket in the
     background — slowly, because Padelful rate-limits hard. The list says it
     is incomplete until they are all in, and the screen keeps asking. Full
     records change rarely and are kept for a week. */

const DIR = path.join(process.cwd(), "storage", "padel", "rackets");
const LIST_TTL = 24 * 3600_000;
const DETAIL_TTL = 7 * 24 * 3600_000;
const MCP_DETAILS = 60;
/** After a detail run that failed part-way (rate limits), wait this long before the next. */
const INCOMPLETE_TTL = 10 * 60_000;

interface SeasonFile {
  season: number;
  source: "rest" | "mcp";
  fetchedAt: string;
  rackets: Racket[];
  /** Some full records could not be read; the list is refreshed sooner. */
  incomplete?: boolean;
}

type Details = Record<string, { at: string; racket: Racket | null }>;

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, file), "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(DIR, { recursive: true });
  const target = path.join(DIR, file);
  const tmp = target + "." + process.pid + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(data), "utf-8");
  // Renaming over a file is atomic on the VPS; Windows can refuse it while the
  // file is being read, and a plain write is good enough for a cache.
  await fs.rename(tmp, target).catch(async () => {
    await fs.writeFile(target, JSON.stringify(data), "utf-8");
    await fs.rm(tmp, { force: true });
  });
}

const seasonFile = (season: number) => `season-${season}.json`;
const stale = (iso: string, ttl: number) => Date.now() - Date.parse(iso) > ttl;

/* ── writes are queued, so two refreshes never interleave a read and a write ── */

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

async function recordPrices(rackets: readonly Racket[], now: string): Promise<void> {
  const snapshots = (await readJson<Snapshots>("prices.json")) ?? {};
  const month = monthOf(now);
  const current = { ...(snapshots[month] ?? {}) };
  for (const r of rackets) if (r.price !== null) current[r.slug] = r.price;
  await writeJson("prices.json", { ...snapshots, [month]: current });
}

/* ── reading Padelful ──────────────────────────────────────── */

/** REST: the whole catalogue, written as one file per season. */
async function refreshFromRest(now: string): Promise<boolean> {
  const raw = await restCatalogue();
  if (!raw) return false;
  const bySeason = new Map<number, Racket[]>();
  for (const r of raw.map(normalize)) {
    if (!r) continue;
    const list = bySeason.get(r.season) ?? [];
    list.push(r);
    bySeason.set(r.season, list);
  }
  await serial(async () => {
    for (const [season, rackets] of bySeason) {
      await writeJson(seasonFile(season), { season, source: "rest", fetchedAt: now, rackets } satisfies SeasonFile);
    }
    await recordPrices([...bySeason.values()].flat(), now);
  });
  return true;
}

/** Every brand the app has ever seen; the first time, those a few broad
    searches turn up. */
async function brandsFor(season: number): Promise<string[]> {
  const brands = new Set<string>();
  const known = await fs.readdir(DIR).catch(() => [] as string[]);
  for (const f of known.filter((f) => f.startsWith("season-"))) {
    (await readJson<SeasonFile>(f))?.rackets.forEach((r) => r.brand && brands.add(r.brand));
  }
  // Padelful covers about forty brands; once most are known, skip the probes.
  if (brands.size >= 25) return [...brands].sort();
  const q = String(season);
  const probes = await pool(
    [{ query: q }, { query: q, minRating: 8 }, { query: q, minRating: 8.5 }, { query: q, shape: "Round" as const }, { query: q, shape: "Diamond" as const }],
    3,
    (args) => searchRackets(args).catch(() => []),
  );
  for (const r of probes.flat()) if (typeof r.brand === "string" && r.brand) brands.add(r.brand);
  return [...brands].sort();
}

const byRating = (a: Racket, b: Racket) => b.rating - a.rating;

/** The season's best rackets that still lack a fresh full record. */
function missing(rackets: readonly Racket[], details: Details): Racket[] {
  return [...rackets]
    .sort(byRating)
    .slice(0, MCP_DETAILS)
    .filter((r) => !details[r.slug] || stale(details[r.slug].at, DETAIL_TTL));
}

/** MCP, first pass: the season brand by brand. Fast enough to wait for, and
    enough to show the list with its ratings; prices come in fillDetails. */
async function refreshFromMcp(season: number, now: string): Promise<void> {
  const brands = await brandsFor(season);
  if (brands.length === 0) throw new Error("Padelful MCP returned nothing");
  const found = new Map<string, Racket>();
  const results = await pool(brands, 3, (brand) => searchRackets({ query: String(season), brand }).catch(() => []));
  for (const raw of results.flat()) {
    const r = normalize(raw);
    if (r && r.season === season && !found.has(r.slug)) found.set(r.slug, r);
  }
  if (found.size === 0) throw new Error(`Padelful has no ${season} rackets`);

  await serial(async () => {
    const details = (await readJson<Details>("details.json")) ?? {};
    const rackets = [...found.values()].sort(byRating).map((r) => merge(r, details[r.slug]?.racket ?? null));
    const incomplete = missing(rackets, details).length > 0;
    await writeJson(seasonFile(season), { season, source: "mcp", fetchedAt: now, rackets, incomplete } satisfies SeasonFile);
    await recordPrices(rackets, now);
  });
}

const detailing = new Map<number, Promise<void>>();
const lastFailure = new Map<number, number>();

/** MCP, second pass, in the background: the full record (price, the five
    ratings, materials) of the season's best, two at a time, saved every few so
    prices appear while it runs. After a run with failures it rests before
    trying again, so a Padelful outage is not met with a stream of calls. */
function fillDetails(season: number): void {
  if (detailing.has(season) || Date.now() - (lastFailure.get(season) ?? 0) < INCOMPLETE_TTL) return;
  const run = (async () => {
    const wanted = missing((await readJson<SeasonFile>(seasonFile(season)))?.rackets ?? [], (await readJson<Details>("details.json")) ?? {});
    let failed = false;
    let pending: [string, Racket | null][] = [];
    const save = (done: boolean) =>
      serial(async () => {
        const now = new Date().toISOString();
        const details = (await readJson<Details>("details.json")) ?? {};
        for (const [slug, racket] of pending) details[slug] = { at: now, racket };
        pending = [];
        const file = await readJson<SeasonFile>(seasonFile(season));
        if (!file) return;
        const rackets = file.rackets.map((r) => merge(r, details[r.slug]?.racket ?? null));
        await writeJson("details.json", details);
        await writeJson(seasonFile(season), { ...file, rackets, incomplete: done ? failed : true } satisfies SeasonFile);
        await recordPrices(rackets, now);
      });
    await pool(wanted, 2, async (r) => {
      try {
        const raw = await getRacket(r.slug);
        pending.push([r.slug, raw ? normalize(raw) : null]);
      } catch {
        failed = true;
      }
      if (pending.length >= 5) await save(false);
    });
    await save(true);
    if (failed) lastFailure.set(season, Date.now());
  })()
    .catch((e) => console.error("Padelful details failed:", e instanceof Error ? e.message : e))
    .finally(() => detailing.delete(season));
  detailing.set(season, run);
}

/* ── what the route asks for ───────────────────────────────── */

const inflight = new Map<number, Promise<void>>();

/** One refresh per season at a time, however many phones ask. */
function refresh(season: number): Promise<void> {
  let p = inflight.get(season);
  if (!p) {
    p = (async () => {
      const now = new Date().toISOString();
      if (!(await refreshFromRest(now))) await refreshFromMcp(season, now);
    })().finally(() => inflight.delete(season));
    inflight.set(season, p);
  }
  return p;
}

export async function seasonRackets(season: number): Promise<SeasonResponse> {
  let file = await readJson<SeasonFile>(seasonFile(season));
  if (!file) {
    await refresh(season);
    file = await readJson<SeasonFile>(seasonFile(season));
    if (!file) throw new Error(`no ${season} rackets`);
  } else if (stale(file.fetchedAt, LIST_TTL)) {
    refresh(season).catch((e) => console.error("Padelful refresh failed:", e instanceof Error ? e.message : e));
  }
  if (file.source === "mcp" && file.incomplete) fillDetails(season);
  const snapshots = (await readJson<Snapshots>("prices.json")) ?? {};
  return {
    season,
    source: file.source,
    fetchedAt: file.fetchedAt,
    incomplete: !!file.incomplete,
    rackets: file.rackets.map((r) => ({ ...r, history: historyOf(r.slug, snapshots) })),
  };
}

export async function priceHistory(slugs: readonly string[]) {
  const snapshots = (await readJson<Snapshots>("prices.json")) ?? {};
  return new Map(slugs.map((s) => [s, historyOf(s, snapshots)]));
}
