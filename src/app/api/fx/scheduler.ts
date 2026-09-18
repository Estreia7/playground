import type { Candle } from "../../fx/types.ts";
import { DEFAULT_PAIR, type PairId } from "../../fx/pairs.ts";
import { TIMEFRAMES, timeframe, type TimeframeId } from "../../fx/timeframes.ts";
import { readCandles, writeCandles, replaceCandles, readJson, writeJson } from "./storage.ts";
import { aggregate } from "./engine/aggregate.ts";
import { fetchMinuteCandles, hasApiKey, ProviderError } from "./providers/twelvedata.ts";
import { BudgetExceededError } from "./providers/budget.ts";
import { fetchRecent } from "./providers/dukascopy.ts";
import { runScan } from "./scan.ts";
import { processNewCandles } from "./paper/store.ts";

/* The scheduler: one timer, one API call, every timeframe updated.

   Each tick buys thirty 1-minute bars and rebuilds 5m through 1d from them by
   aggregation. That is the whole reason the system fits inside a free API
   plan — the cost of a cycle does not depend on how many timeframes exist or
   which one the user is looking at.

   It only runs while the market is open. Forex trades from Sunday 17:00 to
   Friday 17:00 New York time, and New York observes daylight saving, so the
   boundary moves between 21:00 and 22:00 UTC through the year. Asking Intl for
   the wall-clock time in New York gets this right without a table of dates.

   Off by default. The API key is shared between this machine and the VPS, and
   two schedulers would burn the day's allowance twice as fast, so a developer
   has to opt in with FX_SCHEDULER=on. */

const TICK_MS = 5 * 60 * 1000;
/** Bars per tick. Thirty covers a 25-minute outage without a gap. */
const TICK_BARS = 30;
/** A cold start or a long outage seeds from further back. */
const SEED_BARS = 5000;
const SEED_THRESHOLD_MINUTES = 30;

const STATE_FILE = "scan-state.json";

export interface SchedulerState {
  running: boolean;
  startedAt: string | null;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  ticks: number;
  lastReconcileDay: string | null;
}

interface SchedulerHandle {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  ticking: boolean;
}

const GLOBAL_KEY = Symbol.for("playground.fx.scheduler");

function handle(): SchedulerHandle {
  const holder = globalThis as unknown as Record<symbol, SchedulerHandle | undefined>;
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = { timer: null, running: false, ticking: false };
  return holder[GLOBAL_KEY];
}

/* Is the forex market open?

   Sunday 17:00 to Friday 17:00, New York time. The hour is read from the
   formatter rather than computed from a UTC offset, so daylight saving is
   handled by the platform's timezone database rather than by us. */
export function marketIsOpen(now: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");

  switch (weekday) {
    case "Sat":
      return false;
    case "Sun":
      return hour >= 17;
    case "Fri":
      return hour < 17;
    default:
      return true;
  }
}

export async function readSchedulerState(): Promise<SchedulerState> {
  const stored = await readJson<Partial<SchedulerState>>(STATE_FILE, {});
  return {
    running: handle().running,
    startedAt: stored.startedAt ?? null,
    lastTickAt: stored.lastTickAt ?? null,
    lastSuccessAt: stored.lastSuccessAt ?? null,
    lastError: stored.lastError ?? null,
    ticks: stored.ticks ?? 0,
    lastReconcileDay: stored.lastReconcileDay ?? null,
  };
}

async function patchState(patch: Partial<SchedulerState>): Promise<void> {
  const current = await readJson<Partial<SchedulerState>>(STATE_FILE, {});
  await writeJson(STATE_FILE, { ...current, ...patch });
}

/** Start the timer. Safe to call twice: the second call is a no-op. */
export function startScheduler(): boolean {
  const h = handle();
  if (h.running) return false;
  if (process.env.FX_SCHEDULER !== "on") return false;

  h.running = true;
  h.timer = setInterval(() => {
    void tick().catch((error) => {
      console.error("[fx] scheduler tick failed:", error);
    });
  }, TICK_MS);
  // Node keeps the process alive for pending timers; this one should not be
  // the reason a shutdown hangs.
  h.timer.unref?.();

  void patchState({ startedAt: new Date().toISOString() });
  console.log("[fx] scheduler started, ticking every " + TICK_MS / 60000 + " minutes");

  // Run one straight away so a restart does not leave a five-minute hole.
  void tick().catch((error) => console.error("[fx] first tick failed:", error));
  return true;
}

export function stopScheduler(): void {
  const h = handle();
  if (h.timer) clearInterval(h.timer);
  h.timer = null;
  h.running = false;
}

export interface TickResult {
  skipped: "market-closed" | "no-api-key" | "already-running" | null
  fetched: number;
  aggregated: TimeframeId[];
  setups: number;
  alerts: number;
  reconciled: boolean;
}

/** One cycle: fetch, aggregate, scan, fill paper orders. */
export async function tick(pairId: PairId = DEFAULT_PAIR, force = false): Promise<TickResult> {
  const h = handle();
  const result: TickResult = {
    skipped: null,
    fetched: 0,
    aggregated: [],
    setups: 0,
    alerts: 0,
    reconciled: false,
  };

  // Ticks must not overlap: the previous one may still be writing candles.
  if (h.ticking) {
    result.skipped = "already-running";
    return result;
  }
  h.ticking = true;

  try {
    await patchState({ lastTickAt: new Date().toISOString() });

    if (!force && !marketIsOpen()) {
      result.skipped = "market-closed";
      return result;
    }
    if (!hasApiKey()) {
      result.skipped = "no-api-key";
      // Without live data there is nothing to fetch, but the stored history is
      // still worth scanning — a backfill may have just finished.
      const scan = await runScan(pairId);
      result.setups = scan.setups.length;
      result.alerts = scan.newAlerts.length;
      return result;
    }

    // --- 1. Fetch -----------------------------------------------------------
    const existing = await readCandles(pairId, "1m");
    const lastBar = existing.length > 0 ? existing[existing.length - 1][0] : 0;
    const minutesBehind = lastBar === 0 ? Infinity : (Date.now() / 1000 - lastBar) / 60;
    const wanted = minutesBehind > SEED_THRESHOLD_MINUTES ? SEED_BARS : TICK_BARS;

    const fresh = await fetchMinuteCandles(pairId, { outputsize: wanted });
    result.fetched = fresh.length;
    if (fresh.length > 0) {
      await writeCandles(pairId, "1m", fresh);
    }

    // --- 2. Aggregate -------------------------------------------------------
    result.aggregated = await rebuildFromMinutes(pairId);

    // --- 3. Nightly reconcile ----------------------------------------------
    result.reconciled = await maybeReconcile(pairId);

    // --- 4. Scan and fill ---------------------------------------------------
    const scan = await runScan(pairId);
    result.setups = scan.setups.length;
    result.alerts = scan.newAlerts.length;

    await processNewCandles(pairId);

    await patchState({
      lastSuccessAt: new Date().toISOString(),
      lastError: null,
      ticks: (await readSchedulerState()).ticks + 1,
    });
    return result;
  } catch (error) {
    const message =
      error instanceof BudgetExceededError || error instanceof ProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : String(error);
    await patchState({ lastError: message });
    // A budget refusal is an expected state, not a fault: log it quietly.
    if (error instanceof BudgetExceededError) console.warn("[fx] " + message);
    else console.error("[fx] tick failed: " + message);
    return result;
  } finally {
    h.ticking = false;
  }
}

/* Rebuild every higher timeframe from the 1-minute series.

   Only the recent window is rebuilt. Aggregating five years of 1m data on
   every tick would be wasteful, and the older bars came from Dukascopy, which
   is more accurate than anything we can assemble from a 30-bar API window. */
async function rebuildFromMinutes(pairId: PairId): Promise<TimeframeId[]> {
  const minutes = await readCandles(pairId, "1m");
  if (minutes.length === 0) return [];

  const rebuilt: TimeframeId[] = [];
  const now = Math.floor(Date.now() / 1000);

  for (const tf of TIMEFRAMES) {
    if (tf.id === "1m") continue;

    // Enough 1m bars to cover a few complete bars of the target timeframe.
    const span = tf.seconds * 4;
    const from = now - span;
    const slice = minutes.filter((c) => c[0] >= from);
    if (slice.length === 0) continue;

    const bars = aggregate(slice, "1m", tf.id, { now });
    if (bars.length === 0) continue;

    // Merge rather than replace: these are the newest few bars of a series
    // whose history came from elsewhere.
    await writeCandles(pairId, tf.id, bars);
    rebuilt.push(tf.id);
  }
  return rebuilt;
}

/* Once a day, replace yesterday's bars with Dukascopy's settled version.

   The bars we assembled from 1-minute API data are close but not authoritative:
   the provider's minute bars can be thin at the edges of the session. Dukascopy
   publishes in arrears and is the better record once it is available. */
async function maybeReconcile(pairId: PairId): Promise<boolean> {
  const state = await readSchedulerState();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (state.lastReconcileDay === today) return false;
  // Give Dukascopy time to publish: reconcile after 02:00 UTC.
  if (now.getUTCHours() < 2) return false;

  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = new Date(to.getTime() - 3 * 24 * 60 * 60 * 1000);

  for (const tf of TIMEFRAMES) {
    if (tf.id === "1m") continue; // too much data to re-download daily
    try {
      const bars = await fetchRecent(pairId, tf.id, from, to);
      if (bars.length > 0) await writeCandles(pairId, tf.id, bars);
    } catch (error) {
      console.error(
        "[fx] reconcile failed for " + tf.id + ": " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  await patchState({ lastReconcileDay: today });
  console.log("[fx] reconciled closed bars against Dukascopy");
  return true;
}

export { TICK_MS };
