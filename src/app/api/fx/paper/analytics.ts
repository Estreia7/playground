import type { Trade } from "../../../fx/types.ts";
import { sessionLabel, type Session } from "../engine/score.ts";
import { timeframe, type TimeframeId } from "../../../fx/timeframes.ts";

/* Analytics: did we make money, and if not, why not?

   The headline numbers are the standard ones, but the part that earns its
   place is the loss analysis. "You lost 14 trades" is not actionable. Sorting
   those losses into causes is:

     never worked      the trade never went half a unit of risk in favour.
                       The entry was wrong, not the exit.
     gave it back      it reached a full unit of risk in profit and then
                       stopped out. The entry was fine; the exit was not.
                       This is the expensive one, and the one a trailing stop
                       or a partial exit actually fixes.
     against the tide  the higher timeframes disagreed at entry.
     weak evidence     the setup scored below 60 and was taken anyway.

   A trade can land in more than one bucket. That is deliberate: the buckets
   are diagnoses, not a partition, and a trade that was both against the trend
   and gave back a winner has two things wrong with it. */

export interface Kpis {
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalUsd: number;
  totalPips: number;
  /** Gross profit divided by gross loss. Above 1 is profitable. */
  profitFactor: number | null;
  expectancyUsd: number;
  avgR: number | null;
  bestUsd: number;
  worstUsd: number;
  maxDrawdownUsd: number;
  avgHoldMinutes: number;
}

export interface Breakdown {
  key: string;
  label: string;
  trades: number;
  wins: number;
  winRate: number;
  usd: number;
  avgR: number | null;
}

export interface LossReason {
  key: "never-worked" | "gave-it-back" | "against-htf" | "weak-evidence" | "tagged";
  label: string;
  explanation: string;
  trades: number;
  usd: number;
  /** Trade ids, so the UI can show which ones. */
  ids: string[];
}

export interface EquityPoint {
  time: number;
  balance: number;
  /** Peak balance so far, for drawing the drawdown shading. */
  peak: number;
}

export interface Analytics {
  kpis: Kpis;
  equity: EquityPoint[];
  byTimeframe: Breakdown[];
  byDirection: Breakdown[];
  byScore: Breakdown[];
  bySession: Breakdown[];
  byWeekday: Breakdown[];
  byEvidence: Breakdown[];
  lossReasons: LossReason[];
  /** The worst trades, for the post-mortem list. */
  worstTrades: Trade[];
}

export function analyse(trades: Trade[], startingBalance: number): Analytics {
  // Oldest first, so the equity curve reads left to right.
  const ordered = [...trades].sort((a, b) => a.closedBar - b.closedBar);

  return {
    kpis: computeKpis(ordered, startingBalance),
    equity: equityCurve(ordered, startingBalance),
    byTimeframe: groupBy(ordered, (t) => t.tf, (key) => timeframe(key as TimeframeId).label),
    byDirection: groupBy(ordered, (t) => t.direction, (key) => (key === "long" ? "Long" : "Short")),
    byScore: groupBy(ordered, scoreBucket, (key) => key),
    bySession: groupBy(ordered, (t) => t.session, (key) => sessionLabel(key as Session)),
    byWeekday: groupBy(ordered, (t) => String(t.weekday), (key) => WEEKDAYS[Number(key)] ?? key),
    byEvidence: evidenceBreakdown(ordered),
    lossReasons: diagnoseLosses(ordered),
    worstTrades: [...ordered].sort((a, b) => a.usd - b.usd).slice(0, 10),
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function computeKpis(trades: Trade[], startingBalance: number): Kpis {
  const wins = trades.filter((t) => t.usd > 0);
  const losses = trades.filter((t) => t.usd < 0);
  const grossProfit = wins.reduce((s, t) => s + t.usd, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.usd, 0));
  const withR = trades.filter((t) => t.r !== null);

  const curve = equityCurve(trades, startingBalance);
  let maxDrawdown = 0;
  for (const point of curve) {
    const drawdown = point.peak - point.balance;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const holdMinutes = trades.map((t) => (t.closedBar - t.openedBar) / 60);

  return {
    trades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length === 0 ? 0 : wins.length / trades.length,
    totalUsd: trades.reduce((s, t) => s + t.usd, 0),
    totalPips: trades.reduce((s, t) => s + t.pips, 0),
    // An account with no losses has no ratio to report, which is different
    // from having a ratio of zero.
    profitFactor: grossLoss === 0 ? (grossProfit > 0 ? null : null) : grossProfit / grossLoss,
    expectancyUsd: trades.length === 0 ? 0 : trades.reduce((s, t) => s + t.usd, 0) / trades.length,
    avgR: withR.length === 0 ? null : withR.reduce((s, t) => s + (t.r as number), 0) / withR.length,
    bestUsd: trades.length === 0 ? 0 : Math.max(...trades.map((t) => t.usd)),
    worstUsd: trades.length === 0 ? 0 : Math.min(...trades.map((t) => t.usd)),
    maxDrawdownUsd: maxDrawdown,
    avgHoldMinutes: holdMinutes.length === 0 ? 0 : mean(holdMinutes),
  };
}

function equityCurve(trades: Trade[], startingBalance: number): EquityPoint[] {
  const points: EquityPoint[] = [];
  let balance = startingBalance;
  let peak = startingBalance;

  // Seed the curve at the account's opening balance so the first trade has
  // something to move away from.
  if (trades.length > 0) {
    points.push({ time: trades[0].openedBar, balance, peak });
  }

  for (const trade of trades) {
    balance += trade.usd;
    if (balance > peak) peak = balance;
    points.push({ time: trade.closedBar, balance, peak });
  }
  return points;
}

function scoreBucket(trade: Trade): string {
  if (trade.entryScore === null) return "manual";
  if (trade.entryScore >= 80) return "80+";
  if (trade.entryScore >= 70) return "70-79";
  if (trade.entryScore >= 60) return "60-69";
  return "under 60";
}

function groupBy(
  trades: Trade[],
  keyOf: (trade: Trade) => string,
  labelOf: (key: string) => string,
): Breakdown[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = keyOf(trade);
    const bucket = groups.get(key);
    if (bucket) bucket.push(trade);
    else groups.set(key, [trade]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const wins = group.filter((t) => t.usd > 0).length;
      const withR = group.filter((t) => t.r !== null);
      return {
        key,
        label: labelOf(key),
        trades: group.length,
        wins,
        winRate: wins / group.length,
        usd: group.reduce((s, t) => s + t.usd, 0),
        avgR:
          withR.length === 0 ? null : withR.reduce((s, t) => s + (t.r as number), 0) / withR.length,
      };
    })
    .sort((a, b) => b.trades - a.trades);
}

/** Evidence is a list per trade, so a trade counts towards every signal that
    was present when it was opened. */
function evidenceBreakdown(trades: Trade[]): Breakdown[] {
  const groups = new Map<string, Trade[]>();
  for (const trade of trades) {
    for (const name of trade.entryEvidence) {
      const bucket = groups.get(name);
      if (bucket) bucket.push(trade);
      else groups.set(name, [trade]);
    }
  }

  return [...groups.entries()]
    .map(([name, group]) => {
      const wins = group.filter((t) => t.usd > 0).length;
      const withR = group.filter((t) => t.r !== null);
      return {
        key: name,
        label: name,
        trades: group.length,
        wins,
        winRate: wins / group.length,
        usd: group.reduce((s, t) => s + t.usd, 0),
        avgR:
          withR.length === 0 ? null : withR.reduce((s, t) => s + (t.r as number), 0) / withR.length,
      };
    })
    .sort((a, b) => a.usd - b.usd);
}

function diagnoseLosses(trades: Trade[]): LossReason[] {
  const losses = trades.filter((t) => t.usd < 0);

  const buckets: LossReason[] = [
    {
      key: "never-worked",
      label: "Never worked",
      explanation:
        "The trade never ran half a unit of risk in your favour. The entry was wrong, so a different exit would not have saved it.",
      trades: 0,
      usd: 0,
      ids: [],
    },
    {
      key: "gave-it-back",
      label: "Gave it back",
      explanation:
        "The trade was a full unit of risk in profit and still finished as a loss. The entry was fine; the exit cost the money. This is the one a trailing stop or a partial exit fixes.",
      trades: 0,
      usd: 0,
      ids: [],
    },
    {
      key: "against-htf",
      label: "Against the higher timeframes",
      explanation:
        "The timeframes above this one disagreed with the direction when the position was opened.",
      trades: 0,
      usd: 0,
      ids: [],
    },
    {
      key: "weak-evidence",
      label: "Weak evidence",
      explanation: "The setup scored under 60 and was taken anyway.",
      trades: 0,
      usd: 0,
      ids: [],
    },
    {
      key: "tagged",
      label: "Your own notes",
      explanation: "Losses you tagged with a reason yourself.",
      trades: 0,
      usd: 0,
      ids: [],
    },
  ];

  const add = (key: LossReason["key"], trade: Trade) => {
    const bucket = buckets.find((b) => b.key === key);
    if (!bucket) return;
    bucket.trades++;
    bucket.usd += trade.usd;
    bucket.ids.push(trade.id);
  };

  for (const trade of losses) {
    const riskPips =
      trade.stop === null ? null : Math.abs(trade.entry - trade.stop) / 0.0001;

    if (riskPips !== null && riskPips > 0) {
      const mfeR = trade.mfePips / riskPips;
      if (mfeR < 0.5) add("never-worked", trade);
      if (mfeR >= 1) add("gave-it-back", trade);
    } else if (trade.mfePips <= 0) {
      // No stop to measure against; a trade that never went green at all is
      // still clearly an entry problem.
      add("never-worked", trade);
    }

    if (trade.entryHtfAligned === false) add("against-htf", trade);
    if (trade.entryScore !== null && trade.entryScore < 60) add("weak-evidence", trade);
    if (trade.tags.length > 0) add("tagged", trade);
  }

  return buckets.filter((b) => b.trades > 0).sort((a, b) => a.usd - b.usd);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
