import { promises as fs } from "fs";
import path from "path";
import type { Candle } from "../../fx/types.ts";
import type { PairId } from "../../fx/pairs.ts";
import type { TimeframeId } from "../../fx/timeframes.ts";
import { timeframe, TIMEFRAMES } from "../../fx/timeframes.ts";
import { mergeCandles, largestGapBars } from "./engine/aggregate.ts";

/* Candle store — JSON files on the VPS disk, no database.

   storage/fx/candles/<PAIR>/<tf>.json holds an array of [t,o,h,l,c] tuples in
   ascending time order. The whole file for a timeframe is read once and then
   kept in memory: a scan touches every bar of every timeframe, so paging from
   disk each cycle would be the slowest thing in the system by a wide margin.

   The cache and every other piece of mutable server state hangs off globalThis
   rather than module scope. Next compiles the instrumentation entry separately
   from the route handlers, and dev recompiles modules on edit, so a plain
   module-level `let` can quietly become two caches that disagree with each
   other. One symbol, one instance.

   Writes go to a temporary file and are renamed into place. A crash halfway
   through writing 50 000 bars would otherwise leave a truncated JSON file that
   fails to parse on the next boot, and the fix would be a manual backfill. */

const STORAGE_DIR = path.join(process.cwd(), "storage", "fx");
const CANDLE_DIR = path.join(STORAGE_DIR, "candles");

export const DUKASCOPY_CACHE = path.join(STORAGE_DIR, "dukascopy-cache");

interface FxGlobals {
  candles: Map<string, Candle[]>;
  /** Guards concurrent writes to the same file. */
  writeLocks: Map<string, Promise<void>>;
}

const GLOBAL_KEY = Symbol.for("playground.fx.storage");

function globals(): FxGlobals {
  const holder = globalThis as unknown as Record<symbol, FxGlobals | undefined>;
  if (!holder[GLOBAL_KEY]) {
    holder[GLOBAL_KEY] = { candles: new Map(), writeLocks: new Map() };
  }
  return holder[GLOBAL_KEY];
}

function key(pair: PairId, tf: TimeframeId): string {
  return pair + ":" + tf;
}

function candleFile(pair: PairId, tf: TimeframeId): string {
  return path.join(CANDLE_DIR, pair, tf + ".json");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Read a timeframe's candles, from memory when we already have them.
    A missing or corrupt file reads as an empty series rather than throwing:
    an experiment that has never been backfilled should show an empty chart
    with a "run a backfill" prompt, not a 500. */
export async function readCandles(pair: PairId, tf: TimeframeId): Promise<Candle[]> {
  const g = globals();
  const cacheKey = key(pair, tf);
  const cached = g.candles.get(cacheKey);
  if (cached) return cached;

  let candles: Candle[] = [];
  try {
    const raw = await fs.readFile(candleFile(pair, tf), "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) candles = parsed as Candle[];
  } catch {
    candles = [];
  }
  g.candles.set(cacheKey, candles);
  return candles;
}

/** Merge new bars in, trim to the timeframe's cap, and persist.
    Returns the resulting series so callers can use it without a second read. */
export async function writeCandles(
  pair: PairId,
  tf: TimeframeId,
  incoming: Candle[],
): Promise<Candle[]> {
  const existing = await readCandles(pair, tf);
  const merged = mergeCandles(existing, incoming, timeframe(tf).maxBars);

  const g = globals();
  g.candles.set(key(pair, tf), merged);
  await persist(pair, tf, merged);
  return merged;
}

/** Replace a timeframe wholesale — used by aggregation, which rebuilds the
    open window from 1m rather than merging bar by bar. */
export async function replaceCandles(
  pair: PairId,
  tf: TimeframeId,
  candles: Candle[],
): Promise<void> {
  const capped = candles.slice(-timeframe(tf).maxBars);
  globals().candles.set(key(pair, tf), capped);
  await persist(pair, tf, capped);
}

/* Serialise writes per file. Two scans finishing at once would otherwise
   interleave their renames and the loser's bars would vanish. */
async function persist(pair: PairId, tf: TimeframeId, candles: Candle[]): Promise<void> {
  const g = globals();
  const lockKey = key(pair, tf);
  const previous = g.writeLocks.get(lockKey) ?? Promise.resolve();

  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const file = candleFile(pair, tf);
      await ensureDir(path.dirname(file));
      const tmp = file + ".tmp";
      // Tuples one per line: the file stays diffable and greppable without
      // costing much more than the fully minified form.
      const body = "[\n" + candles.map((c) => JSON.stringify(c)).join(",\n") + "\n]\n";
      await fs.writeFile(tmp, candles.length === 0 ? "[]\n" : body, "utf-8");
      await fs.rename(tmp, file);
    });

  g.writeLocks.set(lockKey, next);
  await next;
}

/** Drop the in-memory copy so the next read comes from disk. Used by the
    backfill CLI, which writes files from outside the server process. */
export function invalidateCache(pair?: PairId, tf?: TimeframeId): void {
  const g = globals();
  if (pair && tf) g.candles.delete(key(pair, tf));
  else g.candles.clear();
}

export interface TimeframeStatus {
  tf: TimeframeId;
  bars: number;
  firstBar: number | null;
  lastBar: number | null;
  /** Bars missing at the worst gap, a quick health signal for the Data tab. */
  largestGap: number;
  /** Seconds since the last bar closed; null when there is no data. */
  ageSeconds: number | null;
}

export async function timeframeStatus(pair: PairId, tf: TimeframeId): Promise<TimeframeStatus> {
  const candles = await readCandles(pair, tf);
  const last = candles.length > 0 ? candles[candles.length - 1][0] : null;
  return {
    tf,
    bars: candles.length,
    firstBar: candles.length > 0 ? candles[0][0] : null,
    lastBar: last,
    largestGap: largestGapBars(candles, tf),
    ageSeconds: last === null ? null : Math.floor(Date.now() / 1000) - last,
  };
}

export async function allTimeframeStatus(pair: PairId): Promise<TimeframeStatus[]> {
  return Promise.all(TIMEFRAMES.map((tf) => timeframeStatus(pair, tf.id)));
}

/* ---- Generic JSON documents (settings, alerts, paper account, scan state) - */

/** Read a JSON file under storage/fx, returning `fallback` when it is missing
    or unreadable. Never throws: a corrupt settings file should fall back to
    the defaults, not take the page down. */
export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(path.join(STORAGE_DIR, name), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const jsonLocks = new Map<string, Promise<void>>();

export async function writeJson(name: string, value: unknown): Promise<void> {
  const previous = jsonLocks.get(name) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const file = path.join(STORAGE_DIR, name);
      await ensureDir(path.dirname(file));
      const tmp = file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf-8");
      await fs.rename(tmp, file);
    });
  jsonLocks.set(name, next);
  await next;
}

export { STORAGE_DIR, CANDLE_DIR };
