import { readJson, writeJson } from "../storage.ts";

/* API budget guard.

   The Twelve Data free plan allows 8 credits a minute and 800 a day. Those are
   hard limits: cross them and requests start failing, which would leave the
   scanner blind at exactly the moment the market is busy.

   The scheduler needs one call every five minutes, which is 288 a day and
   leaves plenty of room. The guard exists for everything else — a manual "scan
   now" pressed repeatedly, a dev machine sharing the production key, a retry
   loop that gets stuck. Ceilings sit below the real ones so there is always
   headroom for a request we did not plan.

   Counters persist to disk because a PM2 restart in the middle of a busy day
   should not hand the process a fresh allowance. */

const FILE = "budget.json";

const MINUTE_CEILING = 6; // of 8
const DAY_CEILING = 700; // of 800

interface BudgetState {
  /** UTC day, YYYY-MM-DD, the day counter belongs to. */
  day: string;
  dayCount: number;
  /** Unix minute the minute counter belongs to. */
  minute: number;
  minuteCount: number;
  lastCallAt: string | null;
}

const EMPTY: BudgetState = {
  day: "",
  dayCount: 0,
  minute: 0,
  minuteCount: 0,
  lastCallAt: null,
};

const GLOBAL_KEY = Symbol.for("playground.fx.budget");

function cache(): { state: BudgetState | null } {
  const holder = globalThis as unknown as Record<symbol, { state: BudgetState | null } | undefined>;
  if (!holder[GLOBAL_KEY]) holder[GLOBAL_KEY] = { state: null };
  return holder[GLOBAL_KEY];
}

function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

async function load(): Promise<BudgetState> {
  const c = cache();
  if (c.state) return c.state;
  c.state = await readJson<BudgetState>(FILE, EMPTY);
  return c.state;
}

/** Roll the counters forward to `now`, zeroing whichever window has expired. */
function roll(state: BudgetState, now: Date): BudgetState {
  const day = utcDay(now);
  const minute = Math.floor(now.getTime() / 60_000);
  return {
    day,
    dayCount: state.day === day ? state.dayCount : 0,
    minute,
    minuteCount: state.minute === minute ? state.minuteCount : 0,
    lastCallAt: state.lastCallAt,
  };
}

export interface BudgetStatus {
  dayCount: number;
  dayCeiling: number;
  minuteCount: number;
  minuteCeiling: number;
  lastCallAt: string | null;
  canSpend: boolean;
}

export async function budgetStatus(now: Date = new Date()): Promise<BudgetStatus> {
  const rolled = roll(await load(), now);
  return {
    dayCount: rolled.dayCount,
    dayCeiling: DAY_CEILING,
    minuteCount: rolled.minuteCount,
    minuteCeiling: MINUTE_CEILING,
    lastCallAt: rolled.lastCallAt,
    canSpend: rolled.dayCount < DAY_CEILING && rolled.minuteCount < MINUTE_CEILING,
  };
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

/** Claim `credits` before making a call. Throws when the allowance is spent,
    so the caller stops rather than firing a request that will be rejected. */
export async function spend(credits = 1, now: Date = new Date()): Promise<void> {
  const c = cache();
  const rolled = roll(await load(), now);

  if (rolled.dayCount + credits > DAY_CEILING) {
    throw new BudgetExceededError(
      "The daily market-data allowance is spent (" +
        rolled.dayCount +
        " of " +
        DAY_CEILING +
        " calls). It resets at midnight UTC.",
    );
  }
  if (rolled.minuteCount + credits > MINUTE_CEILING) {
    throw new BudgetExceededError(
      "Too many market-data calls this minute (" +
        rolled.minuteCount +
        " of " +
        MINUTE_CEILING +
        "). Try again shortly.",
    );
  }

  const next: BudgetState = {
    ...rolled,
    dayCount: rolled.dayCount + credits,
    minuteCount: rolled.minuteCount + credits,
    lastCallAt: now.toISOString(),
  };
  c.state = next;
  await writeJson(FILE, next);
}

export { MINUTE_CEILING, DAY_CEILING };
