import WebSocket from "ws";
import { readJson, writeJson } from "../lib/cache.ts";
import { addPayment, mergeBuckets, type FlowPayment } from "../engine/flow.ts";
import type { FlowBucket } from "../../../crypto/lib/types.ts";
import { exchangeAccounts } from "./exchanges.ts";

/* XRP exchange-flow collector.

   Subscribes to the XRP Ledger's account stream for every known exchange
   account and adds each XRP payment in or out of them to hourly buckets.
   Only payments touching those accounts are sent, about one a second, so
   this costs almost nothing to run.

   Gaps are filled from history. When the stream (re)starts, every ledger
   between the last one we recorded and the first one the stream covers is
   read back with account_tx, account by account. Payments seen live while
   that runs are held aside and only committed together with the backfill,
   so a crash halfway leaves the store exactly as it was and the next start
   simply repeats the backfill. On a first start there is nothing to resume
   from, so it reads back BACKFILL_DAYS.

   History therefore starts on the day this first ran: no free service
   publishes past exchange flows for XRP. */

const STREAM_SERVERS = ["wss://s2.ripple.com", "wss://s1.ripple.com"];
const RPC_SERVERS = ["https://s2.ripple.com:51234/", "https://s1.ripple.com:51234/"];
const RIPPLE_EPOCH = 946684800;
const KEEP_DAYS = 400;
const SUBSCRIBE_CHUNK = 100;
const FILE = "xrpl/flow.json";

function backfillDays(): number {
  const v = Number(process.env.CRYPTO_XRPL_BACKFILL_DAYS ?? 3);
  return Number.isFinite(v) && v >= 0 ? Math.min(v, 30) : 3;
}

interface Stored {
  since: number | null;
  lastLedger: number | null;
  buckets: FlowBucket[];
}

interface State {
  started: boolean;
  ws: WebSocket | null;
  connected: boolean;
  since: number | null;
  /** Highest ledger whose payments are all committed. */
  lastLedger: number | null;
  /** Highest ledger the stream has closed. */
  streamLedger: number | null;
  /** First ledger the current stream covers in full. */
  streamFirst: number | null;
  backfilling: boolean;
  committed: Map<number, FlowBucket>;
  pending: Map<number, FlowBucket>;
  /** Hashes counted live, so a backfill that overlaps the stream skips them. */
  recent: Set<string>;
  exchanges: Map<string, string>;
  message: string | null;
  loaded: boolean;
  dirty: boolean;
}

const KEY = Symbol.for("playground.crypto.xrpl");

function state(): State {
  const holder = globalThis as unknown as Record<symbol, State | undefined>;
  if (!holder[KEY]) {
    holder[KEY] = {
      started: false,
      ws: null,
      connected: false,
      since: null,
      lastLedger: null,
      streamLedger: null,
      streamFirst: null,
      backfilling: false,
      committed: new Map(),
      pending: new Map(),
      recent: new Set(),
      exchanges: new Map(),
      message: null,
      loaded: false,
      dirty: false,
    };
  }
  return holder[KEY];
}

async function load(s: State): Promise<void> {
  if (s.loaded) return;
  const stored = await readJson<Stored>(FILE);
  if (stored) {
    s.since = stored.since;
    s.lastLedger = stored.lastLedger;
    for (const b of stored.buckets) s.committed.set(b.t, b);
  }
  s.loaded = true;
}

async function save(s: State): Promise<void> {
  const cutoff = Date.now() / 1000 - KEEP_DAYS * 86400;
  for (const t of s.committed.keys()) if (t < cutoff) s.committed.delete(t);
  const buckets = [...s.committed.values()].sort((a, b) => a.t - b.t);
  await writeJson(FILE, { since: s.since, lastLedger: s.lastLedger, buckets } satisfies Stored);
  s.dirty = false;
}

/* ── Parsing ─────────────────────────────────────────────────────────── */

interface RawTx {
  TransactionType?: string;
  Account?: string;
  Destination?: string;
  date?: number;
  hash?: string;
  ledger_index?: number;
}

interface RawEntry {
  tx?: RawTx;
  tx_json?: RawTx;
  transaction?: RawTx;
  meta?: { TransactionResult?: string; delivered_amount?: unknown; DeliveredAmount?: unknown } | string;
  hash?: string;
  ledger_index?: number;
  close_time_iso?: string;
  validated?: boolean;
}

/** An XRP payment from a stream message or account_tx entry, or null. */
export function paymentOf(entry: RawEntry): (FlowPayment & { hash: string; ledger: number }) | null {
  const tx = entry.tx_json ?? entry.tx ?? entry.transaction;
  const meta = typeof entry.meta === "object" ? entry.meta : undefined;
  if (!tx || !meta || tx.TransactionType !== "Payment" || meta.TransactionResult !== "tesSUCCESS") return null;
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  // Issued currencies arrive as objects; XRP is a string of drops.
  if (typeof delivered !== "string") return null;
  const xrp = Number(delivered) / 1e6;
  const time = tx.date !== undefined
    ? tx.date + RIPPLE_EPOCH
    : entry.close_time_iso
      ? Math.floor(Date.parse(entry.close_time_iso) / 1000)
      : Math.floor(Date.now() / 1000);
  const hash = entry.hash ?? tx.hash ?? "";
  const ledger = entry.ledger_index ?? tx.ledger_index ?? 0;
  if (!tx.Account || !tx.Destination || !(xrp > 0)) return null;
  return { from: tx.Account, to: tx.Destination, xrp, time, hash, ledger };
}

/* ── Backfill over JSON-RPC ──────────────────────────────────────────── */

async function rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = RPC_SERVERS[attempt % RPC_SERVERS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, params: [params] }),
        signal: AbortSignal.timeout(30_000),
      });
      const body = (await res.json()) as { result: T & { status?: string; error?: string } };
      if (body.result?.status === "error") {
        if (body.result.error === "slowDown" || body.result.error === "tooBusy") throw new Error(body.result.error);
        throw Object.assign(new Error(body.result.error ?? "rpc error"), { final: true });
      }
      return body.result;
    } catch (err) {
      lastError = err;
      if ((err as { final?: boolean }).final) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  throw lastError;
}

interface AccountTxResult {
  transactions: RawEntry[];
  marker?: unknown;
}

async function backfillAccount(
  account: string,
  minLedger: number,
  maxLedger: number,
  cutoff: number,
  s: State,
  into: Map<number, FlowBucket>
): Promise<void> {
  let marker: unknown;
  for (let page = 0; page < 500; page++) {
    const result = await rpc<AccountTxResult>("account_tx", {
      account,
      ledger_index_min: minLedger,
      ledger_index_max: maxLedger,
      limit: 400,
      forward: false,
      ...(marker ? { marker } : {}),
    });
    let older = false;
    for (const entry of result.transactions ?? []) {
      const p = paymentOf(entry);
      if (!p) continue;
      if (p.time < cutoff) {
        older = true;
        continue;
      }
      if (s.recent.has(p.hash)) continue;
      addPayment(into, p, s.exchanges);
    }
    marker = result.marker;
    if (!marker || older) return;
  }
}

async function backfill(s: State, maxLedger: number): Promise<Map<number, FlowBucket>> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - backfillDays() * 86400;
  const minLedger = s.lastLedger !== null ? s.lastLedger + 1 : -1;
  const found = new Map<number, FlowBucket>();
  if (s.lastLedger !== null && minLedger > maxLedger) return found;

  const accounts = [...s.exchanges.keys()];
  let failed = 0;
  let next = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < accounts.length) {
        const account = accounts[next++];
        try {
          await backfillAccount(account, minLedger, maxLedger, windowStart, s, found);
        } catch {
          failed++;
        }
      }
    })
  );
  s.message = failed
    ? `History for ${failed} of ${accounts.length} exchange accounts could not be read back; those gaps stay empty.`
    : null;
  return found;
}

/* ── Stream ──────────────────────────────────────────────────────────── */

function connect(s: State, attempt = 0): void {
  const url = STREAM_SERVERS[attempt % STREAM_SERVERS.length];
  const ws = new WebSocket(url);
  s.ws = ws;
  s.streamFirst = null;
  s.pending = new Map();
  const accounts = [...s.exchanges.keys()];
  const chunks = Math.ceil(accounts.length / SUBSCRIBE_CHUNK);
  let acked = 0;
  let id = 1;

  ws.on("open", () => {
    s.connected = true;
    ws.send(JSON.stringify({ id: id++, command: "subscribe", streams: ["ledger"] }));
    for (let i = 0; i < accounts.length; i += SUBSCRIBE_CHUNK) {
      ws.send(JSON.stringify({ id: id++, command: "subscribe", accounts: accounts.slice(i, i + SUBSCRIBE_CHUNK) }));
    }
  });

  ws.on("message", (data) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.type === "response") {
      if (msg.status === "success" && typeof msg.id === "number" && msg.id > 1) acked++;
      else if (msg.status !== "success") {
        s.message = `The ledger server refused a subscription (${String(msg.error ?? "error")}); reconnecting.`;
        ws.close();
      }
      return;
    }
    if (msg.type === "ledgerClosed") {
      const idx = Number(msg.ledger_index);
      s.streamLedger = idx;
      // The stream covers every account in full from the first ledger that
      // closes after the last subscription was confirmed.
      if (s.streamFirst === null && acked >= chunks) {
        s.streamFirst = idx + 1;
        void startBackfill(s, idx);
      }
      if (!s.backfilling && s.streamFirst !== null && idx >= s.streamFirst) {
        s.lastLedger = idx;
        s.dirty = true;
      }
      return;
    }
    if (msg.type === "transaction" && msg.validated) {
      const p = paymentOf(msg as RawEntry);
      if (!p || s.streamFirst === null || p.ledger < s.streamFirst) return;
      s.recent.add(p.hash);
      if (s.recent.size > 20_000) s.recent = new Set([...s.recent].slice(-10_000));
      const target = s.backfilling ? s.pending : s.committed;
      if (addPayment(target, p, s.exchanges)) s.dirty = true;
    }
  });

  const retry = () => {
    if (s.ws !== ws) return;
    s.connected = false;
    s.ws = null;
    // Payments held for an unfinished backfill are dropped with it; the next
    // connection reads the same ledgers back again.
    s.pending = new Map();
    setTimeout(() => connect(s, attempt + 1), Math.min(60_000, 5_000 * (attempt + 1)));
  };
  ws.on("close", retry);
  ws.on("error", () => {
    s.message = `Lost the connection to ${new URL(url).host}; reconnecting.`;
    ws.terminate();
  });
}

async function startBackfill(s: State, upTo: number): Promise<void> {
  const ws = s.ws;
  try {
    s.backfilling = true;
    const found = await backfill(s, upTo);
    if (s.ws !== ws) return; // the connection dropped meanwhile; start over
    mergeBuckets(s.committed, found.values());
    mergeBuckets(s.committed, s.pending.values());
    s.pending = new Map();
    s.lastLedger = s.streamLedger ?? upTo;
    if (s.since === null) s.since = Math.floor(Date.now() / 1000) - backfillDays() * 86400;
    await save(s);
  } catch (err) {
    s.message = `Backfill failed: ${err instanceof Error ? err.message : String(err)}`;
    ws?.close();
  } finally {
    s.backfilling = false;
  }
}

/** Start once per server process. Runs in production, and in development
    only with CRYPTO_XRPL=on; CRYPTO_XRPL=off turns it off everywhere. */
export async function startCollector(): Promise<void> {
  const flag = process.env.CRYPTO_XRPL;
  if (flag === "off") return;
  if (flag !== "on" && process.env.NODE_ENV !== "production") return;
  const s = state();
  if (s.started) return;
  s.started = true;
  try {
    await load(s);
    s.exchanges = await exchangeAccounts();
  } catch (err) {
    s.message = `Could not start: ${err instanceof Error ? err.message : String(err)}`;
    s.started = false;
    setTimeout(() => void startCollector(), 10 * 60_000);
    return;
  }
  connect(s);
  setInterval(() => {
    if (s.dirty && !s.backfilling) void save(s).catch(() => {});
  }, 60_000).unref?.();
}

export async function flowSnapshot(): Promise<{
  status: {
    running: boolean;
    connected: boolean;
    since: number | null;
    lastLedger: number | null;
    backfilling: boolean;
    exchanges: number;
    accounts: number;
    message: string | null;
  };
  hourly: FlowBucket[];
}> {
  const s = state();
  if (!s.loaded) await load(s).catch(() => {});
  return {
    status: {
      running: s.started,
      connected: s.connected,
      since: s.since,
      lastLedger: s.lastLedger,
      backfilling: s.backfilling,
      exchanges: new Set(s.exchanges.values()).size,
      accounts: s.exchanges.size,
      message: s.message,
    },
    hourly: [...s.committed.values()].sort((a, b) => a.t - b.t),
  };
}
