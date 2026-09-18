import type { Candle } from "../../../fx/types.ts";
import { pair, type PairId } from "../../../fx/pairs.ts";
import { spend } from "./budget.ts";

/* Twelve Data — the live feed.

   We buy 1-minute bars only, and build every other timeframe from them by
   aggregation. That keeps the whole system inside one API credit per cycle
   whatever the user is looking at, which is what makes the free plan enough.

   The API answers newest-first; the store wants oldest-first, so the values
   are reversed on the way in. Prices come back as strings and are parsed
   explicitly rather than coerced, because a silent NaN in a candle propagates
   into the indicators and then into a score with no obvious symptom. */

const ENDPOINT = "https://api.twelvedata.com/time_series";

export class ProviderError extends Error {
  readonly status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.FX_TWELVEDATA_KEY);
}

interface TwelveDataValue {
  datetime?: string;
  open?: string;
  high?: string;
  low?: string;
  close?: string;
}

interface TwelveDataResponse {
  status?: string;
  message?: string;
  code?: number;
  values?: TwelveDataValue[];
}

export interface FetchOptions {
  /** How many bars to ask for. The API caps this at 5000. */
  outputsize: number;
  /** Abort if the request takes longer than this. */
  timeoutMs?: number;
}

/** Fetch 1-minute candles for a pair, oldest first.
    Charges the budget before the request, so a refusal costs nothing. */
export async function fetchMinuteCandles(
  pairId: PairId,
  options: FetchOptions,
): Promise<Candle[]> {
  const key = process.env.FX_TWELVEDATA_KEY;
  if (!key) {
    throw new ProviderError(
      "No market-data API key is configured. Set FX_TWELVEDATA_KEY to enable the live feed.",
      503,
    );
  }

  await spend(1);

  const url = new URL(ENDPOINT);
  url.searchParams.set("symbol", pair(pairId).twelveData);
  url.searchParams.set("interval", "1min");
  url.searchParams.set("outputsize", String(Math.min(5000, Math.max(1, options.outputsize))));
  url.searchParams.set("timezone", "UTC");
  url.searchParams.set("format", "JSON");
  url.searchParams.set("apikey", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

  let payload: TwelveDataResponse;
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      throw new ProviderError(
        "The market-data provider answered with HTTP " + response.status + ".",
      );
    }
    payload = (await response.json()) as TwelveDataResponse;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("The market-data request timed out.", 504);
    }
    throw new ProviderError(
      "Could not reach the market-data provider: " +
        (error instanceof Error ? error.message : "unknown error"),
    );
  } finally {
    clearTimeout(timer);
  }

  // Twelve Data reports errors in the body with HTTP 200, so the status field
  // matters more than the response code.
  if (payload.status === "error") {
    throw new ProviderError(
      "The market-data provider rejected the request: " + (payload.message ?? "no reason given") + ".",
    );
  }
  if (!Array.isArray(payload.values)) {
    throw new ProviderError("The market-data provider returned no candles.");
  }

  return parseValues(payload.values);
}

/** Convert the API's newest-first strings into ascending candle tuples,
    dropping anything that does not parse cleanly. */
export function parseValues(values: TwelveDataValue[]): Candle[] {
  const out: Candle[] = [];
  for (const value of values) {
    const time = parseUtc(value.datetime);
    const open = Number(value.open);
    const high = Number(value.high);
    const low = Number(value.low);
    const close = Number(value.close);
    if (
      time === null ||
      !Number.isFinite(open) ||
      !Number.isFinite(high) ||
      !Number.isFinite(low) ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    out.push([time, open, high, low, close]);
  }
  out.sort((a, b) => a[0] - b[0]);
  return out;
}

/* The API returns "2026-09-18 14:05:00" with no zone marker, having been asked
   for UTC. Date.parse treats that as local time, which on this VPS would shift
   every bar by an hour or two, so the marker is added explicitly. */
function parseUtc(datetime: string | undefined): number | null {
  if (!datetime) return null;
  const normalised = datetime.includes("T") ? datetime : datetime.replace(" ", "T");
  const withZone = /[Zz]|[+-]\d{2}:?\d{2}$/.test(normalised) ? normalised : normalised + "Z";
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
