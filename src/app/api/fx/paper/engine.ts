import type {
  Account,
  Candle,
  Direction,
  ExitReason,
  Order,
  Position,
  Trade,
} from "../../../fx/types.ts";
import { T, O, H, L, C } from "../../../fx/types.ts";
import { sessionFor, type Session } from "../engine/score.ts";

/* The paper account.

   Fake money, real rules. The point of it is to find out whether the setups
   this tool likes actually make money, which only works if the fills are
   pessimistic rather than flattering. Four decisions do that work:

   Bid prices, spread at the fill. The candle store holds the bid side. A buy
   pays the offer, so it fills at bid + spread; a sell hits the bid. That
   asymmetry is why a scalping strategy that looks profitable on mid prices
   often is not.

   Gaps fill at the open. If a bar opens straight through a stop, the fill is
   the open, not the stop level. The market never traded at the level in
   between, and pretending otherwise invents money that was not there.

   Stop before target. Within one bar we cannot know whether the high or the
   low came first. When a bar spans both, the stop is assumed. That biases
   results downwards, which is the right direction for a number you are about
   to act on.

   Triggered and stopped in the same bar counts. A pending order that fills and
   then gets taken out on the same bar is a real loss, not a position that was
   never opened.

   Everything here is a pure function of (state, candle). The caller owns
   persistence, which keeps this module testable. */

export interface PaperConfig {
  spreadPips: number;
  pipSize: number;
  pipValuePerLotUsd: number;
}

export interface FillResult {
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  /** Things that happened, for the activity log. */
  events: string[];
}

/** Advance the account by one candle: trigger pending orders, then manage
    open positions. Order matters — an order that fills on this bar is exposed
    to the rest of the same bar. */
export function applyCandle(
  candle: Candle,
  orders: Order[],
  positions: Position[],
  config: PaperConfig,
): FillResult {
  const events: string[] = [];
  let nextOrders = [...orders];
  let nextPositions = [...positions];
  const trades: Trade[] = [];

  // --- 1. Pending orders ---------------------------------------------------
  for (const order of orders) {
    if (order.status !== "pending") continue;
    // An order placed against this very bar cannot also fill on it; we only
    // learn the bar's shape after it has closed.
    if (candle[T] <= order.placedBar) continue;

    const fill = triggerPrice(order, candle, config);
    if (fill === null) continue;

    const position: Position = {
      id: order.id + "-p",
      orderId: order.id,
      pair: order.pair,
      tf: order.tf,
      direction: order.direction,
      lots: order.lots,
      entry: fill,
      stop: order.stop,
      target: order.target,
      openedAt: new Date(candle[T] * 1000).toISOString(),
      openedBar: candle[T],
      setupId: order.setupId,
      entryScore: null,
      entryEvidence: [],
      entryHtfAligned: null,
      mfePips: 0,
      maePips: 0,
    };

    nextOrders = nextOrders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            status: "filled" as const,
            filledAt: position.openedAt,
            fillPrice: fill,
            positionId: position.id,
          }
        : o,
    );
    nextPositions.push(position);
    events.push(
      (order.direction === "long" ? "Bought" : "Sold") +
        " " +
        order.lots +
        " lots at " +
        fill.toFixed(5),
    );
  }

  // --- 2. Open positions ---------------------------------------------------
  const survivors: Position[] = [];
  for (const position of nextPositions) {
    const updated = updateExcursions(position, candle, config);
    const exit = exitFor(updated, candle, config);

    if (exit === null) {
      survivors.push(updated);
      continue;
    }

    const trade = closePosition(updated, exit.price, exit.reason, candle[T], config);
    trades.push(trade);
    events.push(
      "Closed " +
        updated.lots +
        " lots at " +
        exit.price.toFixed(5) +
        " (" +
        exit.reason +
        ", " +
        (trade.pips >= 0 ? "+" : "") +
        trade.pips.toFixed(1) +
        " pips)",
    );
  }
  nextPositions = survivors;

  return { orders: nextOrders, positions: nextPositions, trades, events };
}

/* What price would this order fill at on this bar, if at all?

   A long pays the spread on entry, so its trigger is compared against the ask,
   which is bid + spread. Working in bid terms throughout, that means a buy
   stop at price P triggers when the bar's high plus the spread reaches P. */
function triggerPrice(order: Order, candle: Candle, config: PaperConfig): number | null {
  const spread = config.spreadPips * config.pipSize;
  const buying = order.direction === "long";

  if (order.type === "market") {
    // Fills at the open of the next bar, which is the first price available
    // after the instruction was given.
    return buying ? candle[O] + spread : candle[O];
  }

  if (order.price === null) return null;

  // Ask prices for the bar, used when buying.
  const high = buying ? candle[H] + spread : candle[H];
  const low = buying ? candle[L] + spread : candle[L];
  const open = buying ? candle[O] + spread : candle[O];

  if (order.type === "limit") {
    // Buy limit sits below the market and fills when price drops to it.
    if (buying) {
      if (open <= order.price) return open; // gapped past it: better fill
      return low <= order.price ? order.price : null;
    }
    if (open >= order.price) return open;
    return high >= order.price ? order.price : null;
  }

  // Stop orders sit the other side: a buy stop is above the market.
  if (buying) {
    if (open >= order.price) return open; // gapped through
    return high >= order.price ? order.price : null;
  }
  if (open <= order.price) return open;
  return low <= order.price ? order.price : null;
}

/** Track how far the trade ran in favour and against, in pips. Used by the
    analytics tab to tell "never worked" apart from "worked then reversed". */
function updateExcursions(position: Position, candle: Candle, config: PaperConfig): Position {
  const spread = config.spreadPips * config.pipSize;
  const long = position.direction === "long";
  // Exit prices: a long sells at the bid, a short buys back at the ask.
  const best = long ? candle[H] : candle[L] + spread;
  const worst = long ? candle[L] : candle[H] + spread;

  const favourable = long
    ? (best - position.entry) / config.pipSize
    : (position.entry - best) / config.pipSize;
  const adverse = long
    ? (worst - position.entry) / config.pipSize
    : (position.entry - worst) / config.pipSize;

  return {
    ...position,
    mfePips: Math.max(position.mfePips, favourable),
    maePips: Math.min(position.maePips, adverse),
  };
}

/** Does this bar close the position, and at what price? */
function exitFor(
  position: Position,
  candle: Candle,
  config: PaperConfig,
): { price: number; reason: ExitReason } | null {
  const spread = config.spreadPips * config.pipSize;
  const long = position.direction === "long";

  // Exit prices in the same terms as the levels: a long exits on the bid, a
  // short exits by buying the ask.
  const open = long ? candle[O] : candle[O] + spread;
  const high = long ? candle[H] : candle[H] + spread;
  const low = long ? candle[L] : candle[L] + spread;

  const stop = position.stop;
  const target = position.target;

  // A bar that opens beyond a level fills there, not at the level.
  if (stop !== null) {
    if (long ? open <= stop : open >= stop) return { price: open, reason: "stop" };
  }
  if (target !== null) {
    if (long ? open >= target : open <= target) return { price: open, reason: "target" };
  }

  const hitStop = stop !== null && (long ? low <= stop : high >= stop);
  const hitTarget = target !== null && (long ? high >= target : low <= target);

  // Both touched: assume the stop came first.
  if (hitStop) return { price: stop as number, reason: "stop" };
  if (hitTarget) return { price: target as number, reason: "target" };
  return null;
}

export function closePosition(
  position: Position,
  exitPrice: number,
  reason: ExitReason,
  barTime: number,
  config: PaperConfig,
): Trade {
  const long = position.direction === "long";
  const pips = long
    ? (exitPrice - position.entry) / config.pipSize
    : (position.entry - exitPrice) / config.pipSize;
  const usd = pips * config.pipValuePerLotUsd * position.lots;

  // R multiple: the result measured in units of what was risked. A trade with
  // no stop has no R, and saying so is better than inventing one.
  let r: number | null = null;
  if (position.stop !== null) {
    const riskPips = Math.abs(position.entry - position.stop) / config.pipSize;
    r = riskPips > 0 ? pips / riskPips : null;
  }

  const openedDate = new Date(position.openedBar * 1000);
  const hour = openedDate.getUTCHours();

  return {
    id: position.id + "-t",
    positionId: position.id,
    pair: position.pair,
    tf: position.tf,
    direction: position.direction,
    lots: position.lots,
    entry: position.entry,
    exit: exitPrice,
    stop: position.stop,
    target: position.target,
    openedAt: position.openedAt,
    closedAt: new Date(barTime * 1000).toISOString(),
    openedBar: position.openedBar,
    closedBar: barTime,
    pips,
    usd,
    r,
    mfePips: position.mfePips,
    maePips: position.maePips,
    exitReason: reason,
    setupId: position.setupId,
    entryScore: position.entryScore,
    entryEvidence: position.entryEvidence,
    entryHtfAligned: position.entryHtfAligned,
    entryHourUtc: hour,
    session: sessionFor(hour) as Session,
    weekday: openedDate.getUTCDay(),
    tags: [],
    note: "",
  };
}

/** Unrealised profit of an open position at the current bid.

    A long is marked on the bid, which is where it would be sold. A short is
    marked on the ask, which is where it would be bought back — and the ask is
    the bid plus the spread. The entry price already paid its half of the
    spread when the position opened, so this is the only place the other half
    is charged. Marking both sides at the bid would flatter every short by a
    full spread. */
export function unrealised(position: Position, bid: number, config: PaperConfig): number {
  const long = position.direction === "long";
  const spread = config.spreadPips * config.pipSize;
  const exitPrice = long ? bid : bid + spread;
  const pips = long
    ? (exitPrice - position.entry) / config.pipSize
    : (position.entry - exitPrice) / config.pipSize;
  return pips * config.pipValuePerLotUsd * position.lots;
}

export function equityOf(
  account: Account,
  positions: Position[],
  price: number,
  config: PaperConfig,
): number {
  return positions.reduce((sum, p) => sum + unrealised(p, price, config), account.balance);
}

/** Margin a position ties up, as a fraction of the notional. */
export function marginUsed(positions: Position[], leverage: number): number {
  return positions.reduce((sum, p) => sum + (p.lots * 100_000) / leverage, 0);
}

/** Lot size for a given risk budget. Returns 0 when the stop is too tight to
    size against, rather than a position so large it cannot be afforded. */
export function lotsForRisk(
  balance: number,
  riskPercent: number,
  entry: number,
  stop: number,
  config: PaperConfig,
): number {
  const riskUsd = balance * (riskPercent / 100);
  const stopPips = Math.abs(entry - stop) / config.pipSize;
  if (stopPips <= 0) return 0;
  const perLot = stopPips * config.pipValuePerLotUsd;
  // Round down to the nearest micro lot: never risk more than asked. The
  // epsilon absorbs binary floating point — 100/200 lands on 0.49999999999
  // often enough that an exact half-lot would otherwise be rounded to 0.49.
  const raw = (riskUsd / perLot) * 100;
  return Math.max(0, Math.floor(raw + 1e-9) / 100);
}

export { T, O, H, L, C };
export type { Direction };
