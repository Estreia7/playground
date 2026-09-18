import crypto from "crypto";
import type { Candle, Direction, Evidence, Setup, Alert } from "../../fx/types.ts";
import { C } from "../../fx/types.ts";
import { pair, type PairId } from "../../fx/pairs.ts";
import { higherTimeframes, timeframe, TIMEFRAMES, type TimeframeId } from "../../fx/timeframes.ts";
import { readCandles, readJson, writeJson } from "./storage.ts";
import { readSettings, type FxSettings } from "./settings.ts";
import { rsi, macd, atr, ema } from "./engine/indicators.ts";
import { detectAt } from "./engine/candles.ts";
import { evaluateRules } from "./engine/rules.ts";
import { findAnalogs, statsFor } from "./engine/similarity.ts";
import { scoreSetup, htfState, type HtfState } from "./engine/score.ts";

/* The scan cycle: candles in, ranked setups out.

   For each timeframe we look at the last CLOSED bar — never the one still
   forming, whose high, low and close are all still moving. Everything that
   follows is evidence about that one bar:

     1. indicators over the whole series
     2. rule signals and candlestick patterns on the trigger bar
     3. the direction those signals point in, which is what we then test
     4. historical analogs of the current window, and what followed them
     5. how the two timeframes above are leaning
     6. a score built from all of it

   A timeframe with no directional evidence produces no setup. That is the
   normal case: most bars are not the start of anything, and a tool that always
   has an opinion is a tool that is usually wrong. */

export interface ScanResult {
  pair: PairId;
  setups: Setup[];
  newAlerts: Alert[];
  scannedAt: string;
  /** Timeframes that were recomputed this cycle, and those left cached. */
  recomputed: TimeframeId[];
  skipped: TimeframeId[];
  durationMs: number;
}

interface SetupsCache {
  /** pair:tf -> { barTime, setups } */
  [key: string]: { barTime: number; setups: Setup[] };
}

const SETUPS_FILE = "setups-cache.json";
const ALERTS_FILE = "alerts.json";
const MAX_ALERTS = 500;

/** Run one full scan. `force` recomputes every timeframe even when its last
    closed bar has not changed — used by the "Scan now" button after a settings
    edit, where cached setups would reflect the old parameters. */
export async function runScan(pairId: PairId, force = false): Promise<ScanResult> {
  const startedAt = Date.now();
  const settings = await readSettings();
  const cache = await readJson<SetupsCache>(SETUPS_FILE, {});

  // Higher-timeframe context is shared across the timeframes below it, so it
  // is computed once per cycle rather than once per setup.
  const context = new Map<TimeframeId, TimeframeContext | null>();
  for (const tf of TIMEFRAMES) {
    context.set(tf.id, await buildContext(pairId, tf.id, settings));
  }

  const setups: Setup[] = [];
  const recomputed: TimeframeId[] = [];
  const skipped: TimeframeId[] = [];

  for (const tf of TIMEFRAMES) {
    const ctx = context.get(tf.id);
    if (!ctx) {
      skipped.push(tf.id);
      continue;
    }

    const cacheKey = pairId + ":" + tf.id;
    const cached = cache[cacheKey];
    // The expensive part is the analog search. Nothing about it changes until
    // a new bar closes, so an unchanged timeframe reuses its last answer.
    if (!force && cached && cached.barTime === ctx.triggerTime) {
      setups.push(...cached.setups);
      skipped.push(tf.id);
      continue;
    }

    const found = analyseTimeframe(pairId, tf.id, ctx, context, settings);
    cache[cacheKey] = { barTime: ctx.triggerTime, setups: found };
    setups.push(...found);
    recomputed.push(tf.id);
  }

  setups.sort((a, b) => b.score - a.score);
  await writeJson(SETUPS_FILE, cache);

  const newAlerts = await raiseAlerts(setups, settings);

  return {
    pair: pairId,
    setups,
    newAlerts,
    scannedAt: new Date().toISOString(),
    recomputed,
    skipped,
    durationMs: Date.now() - startedAt,
  };
}

interface TimeframeContext {
  tf: TimeframeId;
  candles: Candle[];
  rsi: number[];
  macd: ReturnType<typeof macd>;
  atr: number[];
  ema50: number[];
  /** Index of the last closed bar. */
  index: number;
  triggerTime: number;
}

/** Load a timeframe and compute every indicator once.
    Returns null when there is not enough history to say anything. */
async function buildContext(
  pairId: PairId,
  tf: TimeframeId,
  settings: FxSettings,
): Promise<TimeframeContext | null> {
  const candles = await readCandles(pairId, tf);
  // MACD needs ~34 bars, the similarity window needs its own, and the analog
  // pool needs enough left over to be worth searching.
  const minimum = settings.similarity.window + settings.similarity.horizon + 60;
  if (candles.length < minimum) return null;

  const closes = candles.map((c) => c[C]);
  const index = candles.length - 1;

  return {
    tf,
    candles,
    rsi: rsi(closes, settings.rules.rsiLength),
    macd: macd(closes, settings.rules.macdFast, settings.rules.macdSlow, settings.rules.macdSignal),
    atr: atr(candles, 14),
    ema50: ema(closes, 50),
    index,
    triggerTime: candles[index][0],
  };
}

function analyseTimeframe(
  pairId: PairId,
  tf: TimeframeId,
  ctx: TimeframeContext,
  all: Map<TimeframeId, TimeframeContext | null>,
  settings: FxSettings,
): Setup[] {
  const { candles, index } = ctx;

  const evidence: Evidence[] = [
    ...evaluateRules({
      candles,
      rsi: ctx.rsi,
      macd: ctx.macd,
      index,
      params: settings.rules,
    }),
    ...detectAt(candles, index, { atr: ctx.atr }),
  ];

  // Which way does the evidence point? Both directions are tested when the
  // signals disagree, and the score sorts it out.
  const directions = new Set<Direction>();
  for (const item of evidence) {
    if (item.direction === "long" || item.direction === "short") directions.add(item.direction);
  }
  if (directions.size === 0) return [];

  // One analog search serves both directions: the study is direction-agnostic
  // and `statsFor` mirrors it.
  const similarity = findAnalogs({
    candles,
    rsi: ctx.rsi,
    macd: ctx.macd,
    atr: ctx.atr,
    index,
    pipSize: pair(pairId).pipSize,
    params: settings.similarity,
  });

  const setups: Setup[] = [];
  for (const direction of directions) {
    const htf = higherTimeframeStates(tf, all, direction);
    const stats = similarity.stats ? statsFor(similarity.stats, direction) : null;

    const { score, components } = scoreSetup({
      direction,
      stats,
      evidence,
      htf,
      candles,
      atr: ctx.atr,
      index,
      weights: settings.weights,
    });

    if (score < settings.minScore) continue;

    const price = candles[index][C];
    const atrValue = ctx.atr[index];
    const stopDistance = atrValue * settings.similarity.stopAtr;
    const targetDistance = atrValue * settings.similarity.targetAtr;
    const pipSize = pair(pairId).pipSize;

    setups.push({
      // Deterministic id: the same bar and direction always produce the same
      // setup, so an alert raised at 10:15 still points at something when the
      // list is recomputed at 10:20.
      id: setupId(pairId, tf, direction, ctx.triggerTime),
      pair: pairId,
      tf,
      direction,
      barTime: ctx.triggerTime,
      price,
      score,
      components,
      evidence: evidence.filter((e) => e.direction === direction || e.direction === "neutral"),
      stats,
      analogs: similarity.analogs,
      suggested: {
        entry: price,
        stop: direction === "long" ? price - stopDistance : price + stopDistance,
        target: direction === "long" ? price + targetDistance : price - targetDistance,
        rr: settings.similarity.targetAtr / settings.similarity.stopAtr,
        stopPips: stopDistance / pipSize,
        targetPips: targetDistance / pipSize,
      },
      atr: atrValue,
      createdAt: new Date().toISOString(),
    });
  }

  return setups;
}

function higherTimeframeStates(
  tf: TimeframeId,
  all: Map<TimeframeId, TimeframeContext | null>,
  direction: Direction,
): HtfState[] {
  const out: HtfState[] = [];
  for (const higher of higherTimeframes(tf)) {
    const ctx = all.get(higher);
    if (!ctx) continue;
    const state = htfState(
      timeframe(higher).label,
      ctx.candles,
      ctx.ema50,
      ctx.macd.macd,
      ctx.rsi,
      ctx.atr,
      direction,
    );
    if (state) out.push(state);
  }
  return out;
}

export function setupId(
  pairId: PairId,
  tf: TimeframeId,
  direction: Direction,
  barTime: number,
): string {
  return crypto
    .createHash("sha1")
    .update([pairId, tf, direction, barTime].join(":"))
    .digest("hex")
    .slice(0, 12);
}

/* Alerts.

   A setup becomes an alert when it crosses the threshold, and only once: the
   id is derived from the bar, so re-scanning the same bar finds the alert
   already there and does nothing. Without that the Alerts tab would fill with
   the same signal every five minutes until the bar closed. */
async function raiseAlerts(setups: Setup[], settings: FxSettings): Promise<Alert[]> {
  const qualifying = setups.filter((s) => s.score >= settings.alertThreshold);
  if (qualifying.length === 0) return [];

  const existing = await readJson<Alert[]>(ALERTS_FILE, []);
  const known = new Set(existing.map((a) => a.setupId));

  const fresh: Alert[] = [];
  for (const setup of qualifying) {
    if (known.has(setup.id)) continue;
    fresh.push({
      id: crypto.randomBytes(8).toString("hex"),
      setupId: setup.id,
      pair: setup.pair,
      tf: setup.tf,
      direction: setup.direction,
      score: setup.score,
      barTime: setup.barTime,
      price: setup.price,
      headline: headlineFor(setup),
      seen: false,
      createdAt: new Date().toISOString(),
    });
  }

  if (fresh.length > 0) {
    const merged = [...fresh, ...existing].slice(0, MAX_ALERTS);
    await writeJson(ALERTS_FILE, merged);
  }
  return fresh;
}

function headlineFor(setup: Setup): string {
  const side = setup.direction === "long" ? "Long" : "Short";
  const label = timeframe(setup.tf).label;
  const lead = setup.evidence.find((e) => e.direction === setup.direction);
  const reason = lead ? lead.name.toLowerCase() : "multiple signals";
  return side + " on the " + label + " after " + reason + ".";
}

export async function readAlerts(): Promise<Alert[]> {
  return readJson<Alert[]>(ALERTS_FILE, []);
}

export async function markAlertsSeen(ids: string[]): Promise<Alert[]> {
  const alerts = await readJson<Alert[]>(ALERTS_FILE, []);
  const wanted = new Set(ids);
  const updated = alerts.map((a) => (wanted.has(a.id) ? { ...a, seen: true } : a));
  await writeJson(ALERTS_FILE, updated);
  return updated;
}

/** Read the setups from the last scan without recomputing anything. */
export async function readCachedSetups(pairId: PairId, tf?: TimeframeId): Promise<Setup[]> {
  const cache = await readJson<SetupsCache>(SETUPS_FILE, {});
  const out: Setup[] = [];
  for (const [key, entry] of Object.entries(cache)) {
    const [cachedPair, cachedTf] = key.split(":");
    if (cachedPair !== pairId) continue;
    if (tf && cachedTf !== tf) continue;
    out.push(...entry.setups);
  }
  return out.sort((a, b) => b.score - a.score);
}
