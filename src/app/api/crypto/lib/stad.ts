import { fetchJson, memo, readJson, writeJson } from "./cache.ts";
import { dailyHistory } from "./history.ts";
import type { StadPayload } from "../../../crypto/lib/types.ts";

/* Short-Term Accumulation & Distribution, built on STH-SOPR.

   STH-SOPR (short-term holder spent output profit ratio) divides the price
   coins were sold at by the price they were bought at, for coins younger
   than 155 days. Above 1, recent buyers are selling at a profit; below 1,
   at a loss. Readings well above 1 are where short-term holders take profit
   (distribution); readings well below are capitulation, which has been the
   better time to accumulate.

   BGeometrics (bitcoin-data.com) publishes it free, a week behind real time
   and from October 2022. The zone lines sit near the top and bottom 7% of
   that history. */

export const STAD_UPPER = 1.025;
export const STAD_LOWER = 0.985;
const LAG_DAYS = 7;

interface SoprRow {
  d: string;
  unixTs: number;
  sthSopr: number;
}

const FILE = "stad/sth-sopr.json";

async function loadSopr(): Promise<SoprRow[]> {
  try {
    const rows = await fetchJson<SoprRow[]>("https://bitcoin-data.com/v1/sth-sopr?startday=2018-01-01", {
      timeoutMs: 40_000,
      retries: 1,
    });
    if (Array.isArray(rows) && rows.length) {
      await writeJson(FILE, rows);
      return rows;
    }
  } catch {
    // The free tier rate-limits hard; the saved copy is at most a day older.
  }
  const saved = await readJson<SoprRow[]>(FILE);
  if (saved?.length) return saved;
  throw new Error("STH-SOPR data is unavailable right now");
}

export async function stadPayload(): Promise<StadPayload> {
  const [sopr, btc] = await Promise.all([
    memo("stad:sopr", 6 * 3600_000, loadSopr, { stale: true }),
    dailyHistory("BTC").catch(() => []),
  ]);
  const closes = new Map(btc.map((r) => [r[0], r[1]]));
  const points: StadPayload["points"] = sopr
    .filter((r) => Number.isFinite(r.sthSopr))
    .map((r) => {
      const day = Math.floor(r.unixTs / 86400) * 86400;
      return [day, r.sthSopr, closes.get(day) ?? null];
    });
  return { updatedAt: Math.floor(Date.now() / 1000), points, upper: STAD_UPPER, lower: STAD_LOWER, lagDays: LAG_DAYS };
}
