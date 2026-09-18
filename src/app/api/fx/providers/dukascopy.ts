import type { Candle } from "../../../fx/types.ts";
import { pair, type PairId } from "../../../fx/pairs.ts";
import { timeframe, type TimeframeId } from "../../../fx/timeframes.ts";
import { DUKASCOPY_CACHE } from "../storage.ts";

/* Dukascopy — the history.

   Free, no key, and it reaches back to the 1970s for EUR/USD, which is what
   makes the similarity engine worth building: a few thousand analogs beats a
   few dozen. The trade-off is latency. Dukascopy publishes in arrears, so it
   is the source of truth for bars that have closed and useless for the last
   hour. Twelve Data covers that gap.

   Downloads happen in chunks with a pause between them. Asking for five years
   of 1-minute data in one call means tens of thousands of HTTP requests to
   their CDN, and a polite client that takes a breath between batches is far
   more likely to finish than one that hammers and gets throttled.

   Bid prices throughout. The store holds one side of the market and the paper
   engine adds the spread at fill time, which keeps the candle data honest
   about what it is. */

export interface BackfillProgress {
  /** Chunks finished so far, and how many there are in total. */
  done: number;
  total: number;
  /** Bars written by the run so far. */
  bars: number;
  /** The window currently downloading, as ISO dates. */
  current: { from: string; to: string } | null;
}

export interface BackfillOptions {
  from: Date;
  to: Date;
  /** Called after each chunk so the UI can show a progress bar. */
  onProgress?: (progress: BackfillProgress) => void;
  /** Abort between chunks. */
  signal?: AbortSignal;
}

/** Days per download chunk. Short timeframes hold far more bars per day, so
    they are fetched in smaller slices to keep each request modest. */
function chunkDays(tf: TimeframeId): number {
  switch (tf) {
    case "1m":
      return 7;
    case "5m":
      return 30;
    case "15m":
    case "30m":
      return 90;
    default:
      return 365;
  }
}

interface DukascopyJsonItem {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Download history for one timeframe, chunk by chunk.
    Chunks that fail are skipped rather than aborting the run: a single bad
    day on their CDN should not cost the other four years. */
export async function backfill(
  pairId: PairId,
  tf: TimeframeId,
  options: BackfillOptions,
): Promise<Candle[]> {
  const { getHistoricalRates } = await import("dukascopy-node");

  const instrument = pair(pairId).dukascopy as Parameters<
    typeof getHistoricalRates
  >[0]["instrument"];
  const dukaTimeframe = timeframe(tf).dukascopy;

  const windows = splitRange(options.from, options.to, chunkDays(tf));
  const all: Candle[] = [];
  let done = 0;

  for (const window of windows) {
    if (options.signal?.aborted) break;

    options.onProgress?.({
      done,
      total: windows.length,
      bars: all.length,
      current: { from: window.from.toISOString(), to: window.to.toISOString() },
    });

    // Their CDN rate-limits bursts with a 429. The library retries within a
    // chunk, but a chunk that exhausts its retries would otherwise be lost
    // outright, leaving a silent hole in the history. Back off and try the
    // whole chunk again, doubling the wait each time.
    let data: DukascopyJsonItem[] | null = null;
    for (let attempt = 0; attempt < 4 && data === null; attempt++) {
      if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1));
      try {
        data = (await getHistoricalRates({
          instrument,
          dates: { from: window.from, to: window.to },
          timeframe: dukaTimeframe,
          priceType: "bid",
          format: "json",
          useCache: true,
          cacheFolderPath: DUKASCOPY_CACHE,
          // Weekend and holiday bars where nothing traded carry no information
          // and would teach the similarity engine patterns that never happened.
          ignoreFlats: true,
          batchSize: 10,
          pauseBetweenBatchesMs: 800,
          retryCount: 3,
          retryOnEmpty: false,
        })) as unknown as DukascopyJsonItem[];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const rateLimited = message.includes("429");
        if (attempt === 3 || !rateLimited) {
          console.error(
            "[fx] Dukascopy chunk failed for " + pairId + " " + tf + " " +
              window.from.toISOString().slice(0, 10) + ": " + message,
          );
          break;
        }
      }
    }

    if (data) {
      for (const item of data) {
        if (
          !Number.isFinite(item.timestamp) ||
          !Number.isFinite(item.open) ||
          !Number.isFinite(item.high) ||
          !Number.isFinite(item.low) ||
          !Number.isFinite(item.close)
        ) {
          continue;
        }
        // Their timestamps are milliseconds; the store keeps seconds.
        all.push([
          Math.floor(item.timestamp / 1000),
          item.open,
          item.high,
          item.low,
          item.close,
        ]);
      }
    }

    done++;
  }

  options.onProgress?.({ done, total: windows.length, bars: all.length, current: null });

  all.sort((a, b) => a[0] - b[0]);
  return dedupe(all);
}

/** Fetch a short recent window — used by the nightly reconcile, which replaces
    the previous day's bars with Dukascopy's settled version. */
export async function fetchRecent(
  pairId: PairId,
  tf: TimeframeId,
  from: Date,
  to: Date,
): Promise<Candle[]> {
  return backfill(pairId, tf, { from, to });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function splitRange(from: Date, to: Date, days: number): { from: Date; to: Date }[] {
  const windows: { from: Date; to: Date }[] = [];
  const step = days * 24 * 60 * 60 * 1000;
  let cursor = from.getTime();
  const end = to.getTime();

  while (cursor < end) {
    const next = Math.min(cursor + step, end);
    windows.push({ from: new Date(cursor), to: new Date(next) });
    cursor = next;
  }
  return windows;
}

/** Chunk boundaries overlap by a bar or two; keep the last version of each. */
function dedupe(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) byTime.set(candle[0], candle);
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}
