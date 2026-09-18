import { isPairId, DEFAULT_PAIR } from "../../../fx/pairs.ts";
import { isTimeframeId, DEFAULT_TIMEFRAME } from "../../../fx/timeframes.ts";
import { C } from "../../../fx/types.ts";
import { readCandles, allTimeframeStatus } from "../storage.ts";
import { readCachedSetups, readAlerts } from "../scan.ts";
import { readSchedulerState, marketIsOpen } from "../scheduler.ts";
import { budgetStatus } from "../providers/budget.ts";
import { hasApiKey } from "../providers/twelvedata.ts";
import { readState } from "../paper/store.ts";

export const dynamic = "force-dynamic";

/* Everything the terminal needs in one request.

   The client polls this on a timer, so it is deliberately one round trip:
   price, setups, alert count, account summary and data health together. Seven
   separate endpoints would mean seven round trips every fifteen seconds. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pair = url.searchParams.get("pair") ?? DEFAULT_PAIR;
  const tf = url.searchParams.get("tf") ?? DEFAULT_TIMEFRAME;

  if (!isPairId(pair)) return Response.json({ error: "Unknown pair." }, { status: 400 });
  if (!isTimeframeId(tf)) return Response.json({ error: "Unknown timeframe." }, { status: 400 });

  const [candles, setups, alerts, scheduler, budget, dataStatus, paper] = await Promise.all([
    readCandles(pair, tf),
    readCachedSetups(pair),
    readAlerts(),
    readSchedulerState(),
    budgetStatus(),
    allTimeframeStatus(pair),
    readState(pair),
  ]);

  const last = candles.length > 0 ? candles[candles.length - 1] : null;

  return Response.json({
    pair,
    tf,
    price: last ? last[C] : null,
    lastBar: last ? last[0] : null,
    setups: setups.filter((s) => s.tf === tf).map((s) => ({ ...s, analogs: [] })),
    allSetups: setups.map((s) => ({ ...s, analogs: [], stats: null })),
    alerts: { unseen: alerts.filter((a) => !a.seen).length, total: alerts.length },
    scheduler: { ...scheduler, marketOpen: marketIsOpen(), hasApiKey: hasApiKey() },
    budget,
    data: dataStatus,
    account: {
      balance: paper.account.balance,
      equity: paper.equity,
      openPnl: paper.openPnl,
      freeMargin: paper.freeMargin,
      openPositions: paper.positions.length,
      pendingOrders: paper.orders.filter((o) => o.status === "pending").length,
    },
  });
}
