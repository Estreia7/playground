import crypto from "crypto";
import type {
  Account,
  Candle,
  Direction,
  Order,
  OrderType,
  Position,
  Setup,
  Trade,
} from "../../../fx/types.ts";
import { C } from "../../../fx/types.ts";
import { pair, type PairId } from "../../../fx/pairs.ts";
import type { TimeframeId } from "../../../fx/timeframes.ts";
import { readJson, writeJson, readCandles } from "../storage.ts";
import { readSettings } from "../settings.ts";
import {
  applyCandle,
  closePosition,
  equityOf,
  marginUsed,
  unrealised,
  type PaperConfig,
} from "./engine.ts";

/* Persistence and orchestration for the paper account.

   The engine is pure; this is the part that reads and writes files, turns a
   setup into an order, and walks new candles through the fill logic. Keeping
   them apart is what makes the fill rules testable without a filesystem.

   Fills are evaluated on the finest candle series that has data, which is not
   always the one the setup came from. Resolution changes the answer: a stop
   and a target inside the same hourly bar resolve to "stop first" under the
   conservative rule, where 1-minute bars usually show which was really touched
   first. */

const ACCOUNT_FILE = "paper/account.json";
const ORDERS_FILE = "paper/orders.json";
const POSITIONS_FILE = "paper/positions.json";
const TRADES_FILE = "paper/trades.json";
/** Last bar each timeframe has been applied up to, so a restart does not
    replay six months of candles through the fill engine. */
const CURSOR_FILE = "paper/cursor.json";

/** Finest first: whichever of these has candles is used to fill orders. */
const FILL_TIMEFRAMES: TimeframeId[] = ["1m", "5m", "15m", "30m", "1h", "4h", "1d"];

export interface PaperState {
  account: Account;
  orders: Order[];
  positions: Position[];
  trades: Trade[];
  /** Mark-to-market figures at the latest price. */
  equity: number;
  marginUsed: number;
  freeMargin: number;
  openPnl: number;
  lastPrice: number | null;
}

async function defaultAccount(): Promise<Account> {
  const settings = await readSettings();
  return {
    startingBalance: settings.paper.startingBalance,
    balance: settings.paper.startingBalance,
    equity: settings.paper.startingBalance,
    leverage: settings.paper.leverage,
    createdAt: new Date().toISOString(),
    resetAt: null,
  };
}

async function config(pairId: PairId): Promise<PaperConfig> {
  const settings = await readSettings();
  const meta = pair(pairId);
  return {
    spreadPips: settings.paper.spreadPips,
    pipSize: meta.pipSize,
    pipValuePerLotUsd: meta.pipValuePerLotUsd,
  };
}

export async function readState(pairId: PairId): Promise<PaperState> {
  const [account, orders, positions, trades, cfg] = await Promise.all([
    readJson<Account | null>(ACCOUNT_FILE, null).then((a) => a ?? defaultAccount()),
    readJson<Order[]>(ORDERS_FILE, []),
    readJson<Position[]>(POSITIONS_FILE, []),
    readJson<Trade[]>(TRADES_FILE, []),
    config(pairId),
  ]);

  const lastPrice = await latestPrice(pairId);
  const openPnl =
    lastPrice === null
      ? 0
      : positions.reduce((sum, p) => sum + unrealised(p, lastPrice, cfg), 0);
  const equity = account.balance + openPnl;
  const margin = marginUsed(positions, account.leverage);

  return {
    account: { ...account, equity },
    orders,
    positions,
    trades,
    equity,
    marginUsed: margin,
    freeMargin: equity - margin,
    openPnl,
    lastPrice,
  };
}

async function latestPrice(pairId: PairId): Promise<number | null> {
  // The finest series that has data gives the freshest price.
  for (const tf of ["1m", "5m", "15m", "30m", "1h"] as TimeframeId[]) {
    const candles = await readCandles(pairId, tf);
    if (candles.length > 0) return candles[candles.length - 1][C];
  }
  return null;
}

export interface PlaceOrderInput {
  pair: PairId;
  tf: TimeframeId;
  direction: Direction;
  type: OrderType;
  price: number | null;
  lots: number;
  stop: number | null;
  target: number | null;
  setup?: Setup | null;
  note?: string;
}

/** Validate an order request. Returns the problems found. */
export function validateOrder(input: PlaceOrderInput, freeMargin: number, leverage: number): string[] {
  const issues: string[] = [];

  if (input.direction !== "long" && input.direction !== "short") {
    issues.push("Direction must be long or short.");
  }
  if (!["market", "limit", "stop"].includes(input.type)) {
    issues.push("Order type must be market, limit or stop.");
  }
  if (!Number.isFinite(input.lots) || input.lots < 0.01) {
    issues.push("Size must be at least 0.01 lots.");
  }
  if (input.lots > 100) {
    issues.push("Size must be 100 lots or fewer.");
  }
  if (input.type !== "market" && (input.price === null || !Number.isFinite(input.price))) {
    issues.push("A limit or stop order needs a price.");
  }

  const reference = input.type === "market" ? null : input.price;
  if (reference !== null && input.stop !== null) {
    // A stop on the wrong side would trigger the instant the order filled.
    if (input.direction === "long" && input.stop >= reference) {
      issues.push("A long position's stop must sit below its entry.");
    }
    if (input.direction === "short" && input.stop <= reference) {
      issues.push("A short position's stop must sit above its entry.");
    }
  }
  if (reference !== null && input.target !== null) {
    if (input.direction === "long" && input.target <= reference) {
      issues.push("A long position's target must sit above its entry.");
    }
    if (input.direction === "short" && input.target >= reference) {
      issues.push("A short position's target must sit below its entry.");
    }
  }

  const required = (input.lots * 100_000) / leverage;
  if (Number.isFinite(input.lots) && required > freeMargin) {
    issues.push(
      "That size needs " +
        required.toFixed(0) +
        " USD of margin and only " +
        freeMargin.toFixed(0) +
        " is free.",
    );
  }

  return issues;
}

export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const orders = await readJson<Order[]>(ORDERS_FILE, []);
  const candles = await readCandles(input.pair, input.tf);
  const lastBar = candles.length > 0 ? candles[candles.length - 1][0] : 0;

  const order: Order = {
    id: crypto.randomBytes(8).toString("hex"),
    pair: input.pair,
    tf: input.tf,
    direction: input.direction,
    type: input.type,
    price: input.type === "market" ? null : input.price,
    lots: Math.round(input.lots * 100) / 100,
    stop: input.stop,
    target: input.target,
    status: "pending",
    setupId: input.setup?.id ?? null,
    createdAt: new Date().toISOString(),
    placedBar: lastBar,
    note: input.note,
  };

  await writeJson(ORDERS_FILE, [order, ...orders]);
  return order;
}

export async function cancelOrder(id: string): Promise<boolean> {
  const orders = await readJson<Order[]>(ORDERS_FILE, []);
  const target = orders.find((o) => o.id === id);
  if (!target || target.status !== "pending") return false;
  await writeJson(
    ORDERS_FILE,
    orders.map((o) => (o.id === id ? { ...o, status: "cancelled" as const } : o)),
  );
  return true;
}

/** Close a position at the current price, by hand. */
export async function closeNow(pairId: PairId, positionId: string): Promise<Trade | null> {
  const [positions, trades, cfg] = await Promise.all([
    readJson<Position[]>(POSITIONS_FILE, []),
    readJson<Trade[]>(TRADES_FILE, []),
    config(pairId),
  ]);

  const position = positions.find((p) => p.id === positionId);
  if (!position) return null;

  const price = await latestPrice(pairId);
  if (price === null) return null;

  // A long sells the bid; a short buys the ask.
  const exitPrice = position.direction === "long" ? price : price + cfg.spreadPips * cfg.pipSize;
  const trade = closePosition(
    position,
    exitPrice,
    "manual",
    Math.floor(Date.now() / 1000),
    cfg,
  );

  await writeJson(POSITIONS_FILE, positions.filter((p) => p.id !== positionId));
  await writeJson(TRADES_FILE, [trade, ...trades]);
  await creditBalance(trade.usd);
  return trade;
}

async function creditBalance(usd: number): Promise<void> {
  const account = (await readJson<Account | null>(ACCOUNT_FILE, null)) ?? (await defaultAccount());
  await writeJson(ACCOUNT_FILE, { ...account, balance: account.balance + usd });
}

/* Walk any new candles through the fill engine.

   Called by the scan cycle, so the account keeps up with the market without
   anyone having the page open. The cursor stops a restart from replaying
   history and filling orders that were already filled months ago. */
export async function processNewCandles(pairId: PairId): Promise<Trade[]> {
  const [orders, positions, trades, cfg] = await Promise.all([
    readJson<Order[]>(ORDERS_FILE, []),
    readJson<Position[]>(POSITIONS_FILE, []),
    readJson<Trade[]>(TRADES_FILE, []),
    config(pairId),
  ]);

  const pending = orders.filter((o) => o.status === "pending");
  if (pending.length === 0 && positions.length === 0) return [];

  /* Fill against the finest series that actually has data.

     Resolution matters here: inside a single hourly bar we cannot tell whether
     the stop or the target was touched first, so the conservative rule assumes
     the stop. On 1-minute bars we usually know, and the answer is both more
     accurate and more often favourable.

     The fallback walks the whole ladder rather than stopping at 5m. A user who
     has only backfilled the hourly series should still get their orders
     filled — worse resolution, but a working account. */
  const cursors = await readJson<Record<string, number>>(CURSOR_FILE, {});

  let tf: TimeframeId | null = null;
  let candles: Candle[] = [];
  for (const candidate of FILL_TIMEFRAMES) {
    const series = await readCandles(pairId, candidate);
    if (series.length > 0) {
      tf = candidate;
      candles = series;
      break;
    }
  }
  if (tf === null || candles.length === 0) return [];

  const cursorKey = pairId + ":" + tf;
  const lastApplied = cursors[cursorKey] ?? 0;
  const fresh = candles.filter((c) => c[0] > lastApplied);
  if (fresh.length === 0) return [];

  let currentOrders = orders;
  let currentPositions = positions;
  const closed: Trade[] = [];

  for (const candle of fresh) {
    const result = applyCandle(candle, currentOrders, currentPositions, cfg);
    currentOrders = result.orders;
    currentPositions = result.positions;
    closed.push(...result.trades);
  }

  if (closed.length > 0) {
    const realised = closed.reduce((sum, t) => sum + t.usd, 0);
    await creditBalance(realised);
  }

  await Promise.all([
    writeJson(ORDERS_FILE, currentOrders),
    writeJson(POSITIONS_FILE, currentPositions),
    closed.length > 0 ? writeJson(TRADES_FILE, [...closed, ...trades]) : Promise.resolve(),
    writeJson(CURSOR_FILE, { ...cursors, [cursorKey]: candles[candles.length - 1][0] }),
  ]);

  return closed;
}

/** Attach the user's post-mortem to a closed trade. */
export async function tagTrade(
  id: string,
  tags: string[],
  note: string,
): Promise<Trade | null> {
  const trades = await readJson<Trade[]>(TRADES_FILE, []);
  const index = trades.findIndex((t) => t.id === id);
  if (index < 0) return null;

  const updated: Trade = {
    ...trades[index],
    tags: tags.slice(0, 10).map((t) => t.slice(0, 40)),
    note: note.slice(0, 2000),
  };
  trades[index] = updated;
  await writeJson(TRADES_FILE, trades);
  return updated;
}

/** Wipe the account back to its starting balance, keeping nothing. */
export async function resetAccount(): Promise<Account> {
  const settings = await readSettings();
  const account: Account = {
    startingBalance: settings.paper.startingBalance,
    balance: settings.paper.startingBalance,
    equity: settings.paper.startingBalance,
    leverage: settings.paper.leverage,
    createdAt: new Date().toISOString(),
    resetAt: new Date().toISOString(),
  };
  await Promise.all([
    writeJson(ACCOUNT_FILE, account),
    writeJson(ORDERS_FILE, []),
    writeJson(POSITIONS_FILE, []),
    writeJson(TRADES_FILE, []),
    writeJson(CURSOR_FILE, {}),
  ]);
  return account;
}

/** Record which setup a position came from, so the analytics tab can ask
    whether the tool's own signals made money. */
export async function attachSetupContext(orderId: string, setup: Setup): Promise<void> {
  const positions = await readJson<Position[]>(POSITIONS_FILE, []);
  const updated = positions.map((p) =>
    p.orderId === orderId
      ? {
          ...p,
          setupId: setup.id,
          entryScore: setup.score,
          entryEvidence: setup.evidence.map((e) => e.name),
          entryHtfAligned:
            setup.components.find((c) => c.key === "htf")?.points ===
            setup.components.find((c) => c.key === "htf")?.max,
        }
      : p,
  );
  await writeJson(POSITIONS_FILE, updated);
}

export { ACCOUNT_FILE, ORDERS_FILE, POSITIONS_FILE, TRADES_FILE };
