"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Order, Position, Setup, Trade } from "../types.ts";
import type { PaperState } from "../../api/fx/paper/store.ts";
import { DEFAULT_PAIR, pair } from "../pairs.ts";
import { timeframe, type TimeframeId } from "../timeframes.ts";
import { price, pips, usd, money, barTime, duration, ratio } from "../format.ts";
import { Panel, Stat, DirectionTag, Notice, Field } from "../ui/parts.tsx";

/* The paper account.

   Fake dollars, real fills. Orders are filled by the same engine the scanner
   runs, against the same candles, with the spread charged and the stop assumed
   whenever a bar touches both levels. The point is to find out whether the
   setups this tool likes actually make money before any real money is
   involved, and that only works if the arithmetic refuses to flatter itself.

   Positions are managed by the server as new candles arrive, so a trade left
   open overnight is filled, stopped or targeted whether or not this page is
   open. */

const RISK_TAGS = [
  "Chased the entry",
  "Against the trend",
  "Moved my stop",
  "News event",
  "Took profit early",
  "Size too large",
  "Revenge trade",
];

export default function PaperView({
  prefill,
  onPrefillUsed,
  signedIn,
  price: currentPrice,
  tf,
  onChanged,
}: {
  prefill: Setup | null;
  onPrefillUsed: () => void;
  signedIn: boolean;
  price: number | null;
  tf: TimeframeId;
  onChanged: () => void;
}) {
  const [state, setState] = useState<PaperState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/fx/paper?pair=" + DEFAULT_PAIR, { cache: "no-store" });
      const body = await response.json();
      if (response.ok) setState(body as PaperState);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (url: string, init?: RequestInit) => {
      setBusy(true);
      setIssues([]);
      try {
        const response = await fetch(url, init);
        const body = await response.json();
        if (!response.ok) {
          setIssues(body.issues ?? [body.error ?? "That did not work."]);
          return false;
        }
        if (body.state) setState(body.state as PaperState);
        else await load();
        onChanged();
        return true;
      } catch {
        setIssues(["Could not reach the server."]);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, onChanged],
  );

  if (loading) return <Notice title="Loading the account…" />;
  if (!state) return <Notice title="Could not load the account" tone="error" />;

  const pending = state.orders.filter((o) => o.status === "pending");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel title="Account">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
            gap: 16,
            padding: "14px",
          }}
        >
          <Stat label="Equity" value={money(state.equity)} />
          <Stat label="Balance" value={money(state.account.balance)} />
          <Stat
            label="Open P&L"
            value={usd(state.openPnl)}
            tone={state.openPnl > 0 ? "long" : state.openPnl < 0 ? "short" : "neutral"}
          />
          <Stat label="Free margin" value={money(state.freeMargin)} />
          <Stat
            label="Since start"
            value={usd(state.equity - state.account.startingBalance)}
            tone={state.equity >= state.account.startingBalance ? "long" : "short"}
          />
        </div>
      </Panel>

      {issues.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--fx-short-dim)" }} role="alert">
          <div style={{ padding: "12px 14px" }}>
            {issues.map((issue) => (
              <p key={issue} style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--fx-short)" }}>
                {issue}
              </p>
            ))}
          </div>
        </div>
      )}

      <div
        className="fx-two-col"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 320px) minmax(0, 1fr)",
          gap: 12,
          alignItems: "start",
        }}
      >
        <OrderTicket
          prefill={prefill}
          onPrefillUsed={onPrefillUsed}
          signedIn={signedIn}
          currentPrice={currentPrice}
          tf={tf}
          balance={state.account.balance}
          busy={busy}
          onSubmit={(payload) =>
            act("/api/fx/paper/orders", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          }
        />

        <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
          <Positions
            positions={state.positions}
            lastPrice={state.lastPrice}
            signedIn={signedIn}
            busy={busy}
            onClose={(id) => act("/api/fx/paper/positions/" + id, { method: "POST" })}
          />

          {pending.length > 0 && (
            <PendingOrders
              orders={pending}
              signedIn={signedIn}
              busy={busy}
              onCancel={(id) => act("/api/fx/paper/orders/" + id, { method: "POST" })}
            />
          )}

          <History trades={state.trades} signedIn={signedIn} onSaved={load} />
        </div>
      </div>

      {signedIn && (
        <Panel title="Danger zone">
          <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 14 }}>
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--fx-muted)", flex: 1 }}>
              Resetting wipes every trade, position and order, and returns the balance to{" "}
              {money(state.account.startingBalance)}. The history cannot be recovered.
            </p>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Reset the paper account? Every trade and position is deleted permanently.",
                  )
                ) {
                  void act("/api/fx/paper/reset", { method: "POST" });
                }
              }}
              style={{ borderColor: "var(--fx-short-dim)", color: "var(--fx-short)" }}
            >
              Reset the account
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

function OrderTicket({
  prefill,
  onPrefillUsed,
  signedIn,
  currentPrice,
  tf,
  balance,
  busy,
  onSubmit,
}: {
  prefill: Setup | null;
  onPrefillUsed: () => void;
  signedIn: boolean;
  currentPrice: number | null;
  tf: TimeframeId;
  balance: number;
  busy: boolean;
  onSubmit: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [direction, setDirection] = useState<"long" | "short">("long");
  const [type, setType] = useState<"market" | "limit" | "stop">("market");
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  const [lots, setLots] = useState("0.10");
  const [setupId, setSetupId] = useState<string | null>(null);
  const [orderTf, setOrderTf] = useState<TimeframeId>(tf);

  // A setup handed over from the terminal fills the ticket in.
  useEffect(() => {
    if (!prefill) return;
    setDirection(prefill.direction);
    setType("market");
    setEntry(prefill.suggested.entry.toFixed(5));
    setStop(prefill.suggested.stop.toFixed(5));
    setTarget(prefill.suggested.target.toFixed(5));
    setSetupId(prefill.id);
    setOrderTf(prefill.tf);
    onPrefillUsed();
  }, [prefill, onPrefillUsed]);

  const meta = pair(DEFAULT_PAIR);
  const reference = type === "market" ? currentPrice : Number(entry);
  const stopValue = Number(stop);
  const targetValue = Number(target);
  const lotsValue = Number(lots);

  // Risk preview: the whole reason to have a ticket rather than a button.
  const riskPips =
    Number.isFinite(reference) && Number.isFinite(stopValue) && reference && stopValue
      ? Math.abs(reference - stopValue) / meta.pipSize
      : null;
  const rewardPips =
    Number.isFinite(reference) && Number.isFinite(targetValue) && reference && targetValue
      ? Math.abs(targetValue - reference) / meta.pipSize
      : null;
  const riskUsd =
    riskPips !== null && Number.isFinite(lotsValue)
      ? riskPips * meta.pipValuePerLotUsd * lotsValue
      : null;
  const rr = riskPips && rewardPips ? rewardPips / riskPips : null;

  const submit = async () => {
    const ok = await onSubmit({
      pair: DEFAULT_PAIR,
      tf: orderTf,
      direction,
      type,
      price: type === "market" ? null : Number(entry),
      lots: lotsValue,
      stop: stop ? Number(stop) : null,
      target: target ? Number(target) : null,
      setupId,
    });
    if (ok) {
      setSetupId(null);
      setStop("");
      setTarget("");
    }
  };

  return (
    <Panel title="New order">
      <div style={{ padding: 14 }}>
        {!signedIn && (
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 12,
              color: "var(--fx-tape)",
              lineHeight: 1.5,
            }}
          >
            Sign in from Settings to place orders.
          </p>
        )}

        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            className={"btn " + (direction === "long" ? "btn-long" : "")}
            style={{ flex: 1 }}
            onClick={() => setDirection("long")}
            aria-pressed={direction === "long"}
          >
            ▲ Buy
          </button>
          <button
            type="button"
            className={"btn " + (direction === "short" ? "btn-short" : "")}
            style={{ flex: 1 }}
            onClick={() => setDirection("short")}
            aria-pressed={direction === "short"}
          >
            ▼ Sell
          </button>
        </div>

        <Field label="Order type">
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="market">Market — fill at the next price</option>
            <option value="limit">Limit — wait for a better price</option>
            <option value="stop">Stop — wait for confirmation</option>
          </select>
        </Field>

        {type !== "market" && (
          <Field label="Entry price">
            <input
              type="number"
              step="0.00001"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              placeholder={currentPrice ? currentPrice.toFixed(5) : "1.10000"}
            />
          </Field>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Field label="Stop loss">
            <input
              type="number"
              step="0.00001"
              value={stop}
              onChange={(e) => setStop(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="Take profit">
            <input
              type="number"
              step="0.00001"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="optional"
            />
          </Field>
        </div>

        <Field label="Size in lots" hint="0.10 lots is 10 000 units. One pip is $1 at that size.">
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={lots}
            onChange={(e) => setLots(e.target.value)}
          />
        </Field>

        {riskUsd !== null && (
          <div
            style={{
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--fx-ink)",
              border: "1px solid var(--fx-rule)",
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span className="muted">Risking</span>
              <span className="mono" style={{ color: "var(--fx-short)" }}>
                {money(riskUsd)} ({riskPips?.toFixed(1)}p)
              </span>
            </div>
            {rr !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span className="muted">Reward to risk</span>
                <span className="mono" style={{ color: rr >= 1.5 ? "var(--fx-long)" : "var(--fx-text)" }}>
                  {ratio(rr)} : 1
                </span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span className="muted">Of the account</span>
              <span className="mono">{((riskUsd / balance) * 100).toFixed(2)}%</span>
            </div>
          </div>
        )}

        <button
          type="button"
          className="btn btn-accent"
          style={{ width: "100%" }}
          disabled={!signedIn || busy || !Number.isFinite(lotsValue) || lotsValue < 0.01}
          onClick={() => void submit()}
        >
          {busy ? "Placing…" : "Place " + (direction === "long" ? "buy" : "sell") + " order"}
        </button>

        {setupId && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--fx-tape)" }}>
            Linked to a {timeframe(orderTf).label} setup, so the analytics can tell whether the
            tool&apos;s own signals made money.
          </p>
        )}
      </div>
    </Panel>
  );
}

function Positions({
  positions,
  lastPrice,
  signedIn,
  busy,
  onClose,
}: {
  positions: Position[];
  lastPrice: number | null;
  signedIn: boolean;
  busy: boolean;
  onClose: (id: string) => void;
}) {
  const meta = pair(DEFAULT_PAIR);

  return (
    <Panel title="Open positions" action={<span className="chip mono">{positions.length}</span>}>
      {positions.length === 0 ? (
        <Notice title="Nothing open">
          Orders you place appear here once they fill. Market orders fill on the next candle.
        </Notice>
      ) : (
        <div style={{ overflowX: "auto" }} className="thin-scroll">
          <table>
            <thead>
              <tr>
                <th>Direction</th>
                <th>TF</th>
                <th className="num">Size</th>
                <th className="num">Entry</th>
                <th className="num">Stop</th>
                <th className="num">Target</th>
                <th className="num">P&L</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const pnlPips =
                  lastPrice === null
                    ? null
                    : position.direction === "long"
                      ? (lastPrice - position.entry) / meta.pipSize
                      : (position.entry - lastPrice) / meta.pipSize;
                const pnlUsd =
                  pnlPips === null ? null : pnlPips * meta.pipValuePerLotUsd * position.lots;

                return (
                  <tr key={position.id}>
                    <td>
                      <DirectionTag direction={position.direction} />
                    </td>
                    <td className="muted">{timeframe(position.tf).label}</td>
                    <td className="num">{position.lots.toFixed(2)}</td>
                    <td className="num">{price(position.entry)}</td>
                    <td className="num short">{position.stop ? price(position.stop) : "—"}</td>
                    <td className="num long">{position.target ? price(position.target) : "—"}</td>
                    <td
                      className="num"
                      style={{
                        color:
                          pnlUsd === null
                            ? "var(--fx-muted)"
                            : pnlUsd >= 0
                              ? "var(--fx-long)"
                              : "var(--fx-short)",
                        fontWeight: 600,
                      }}
                    >
                      {usd(pnlUsd)}
                      <div style={{ fontSize: 10.5, fontWeight: 400, opacity: 0.8 }}>
                        {pips(pnlPips)}p
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 26, padding: "0 9px", fontSize: 11.5 }}
                        disabled={!signedIn || busy}
                        onClick={() => onClose(position.id)}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function PendingOrders({
  orders,
  signedIn,
  busy,
  onCancel,
}: {
  orders: Order[];
  signedIn: boolean;
  busy: boolean;
  onCancel: (id: string) => void;
}) {
  return (
    <Panel title="Waiting to fill" action={<span className="chip mono">{orders.length}</span>}>
      <div style={{ overflowX: "auto" }} className="thin-scroll">
        <table>
          <thead>
            <tr>
              <th>Direction</th>
              <th>Type</th>
              <th className="num">Size</th>
              <th className="num">Price</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <DirectionTag direction={order.direction} />
                </td>
                <td className="muted" style={{ textTransform: "capitalize" }}>
                  {order.type}
                </td>
                <td className="num">{order.lots.toFixed(2)}</td>
                <td className="num">{order.price ? price(order.price) : "market"}</td>
                <td>
                  <button
                    type="button"
                    className="btn"
                    style={{ minHeight: 26, padding: "0 9px", fontSize: 11.5 }}
                    disabled={!signedIn || busy}
                    onClick={() => onCancel(order.id)}
                  >
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function History({
  trades,
  signedIn,
  onSaved,
}: {
  trades: Trade[];
  signedIn: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <Panel title="Closed trades" action={<span className="chip mono">{trades.length}</span>}>
      {trades.length === 0 ? (
        <Notice title="No closed trades yet">
          Once a position hits its stop or target, or you close it by hand, it lands here with what
          it cost and how far it ran either way.
        </Notice>
      ) : (
        <div className="thin-scroll" style={{ maxHeight: 460, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Closed</th>
                <th>Direction</th>
                <th>TF</th>
                <th className="num">Pips</th>
                <th className="num">P&L</th>
                <th className="num">R</th>
                <th>Exit</th>
                <th className="num">Held</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  signedIn={signedIn}
                  editing={editing === trade.id}
                  onEdit={() => setEditing(editing === trade.id ? null : trade.id)}
                  onSaved={() => {
                    setEditing(null);
                    onSaved();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function TradeRow({
  trade,
  signedIn,
  editing,
  onEdit,
  onSaved,
}: {
  trade: Trade;
  signedIn: boolean;
  editing: boolean;
  onEdit: () => void;
  onSaved: () => void;
}) {
  const [tags, setTags] = useState<string[]>(trade.tags);
  const [note, setNote] = useState(trade.note);
  const [saving, setSaving] = useState(false);
  const won = trade.usd >= 0;

  const save = async () => {
    setSaving(true);
    try {
      await fetch("/api/fx/paper/trades/" + trade.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, note }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr>
        <td className="muted mono" style={{ fontSize: 11 }}>
          {barTime(trade.closedBar)}
        </td>
        <td>
          <DirectionTag direction={trade.direction} />
        </td>
        <td className="muted">{timeframe(trade.tf).label}</td>
        <td className="num" style={{ color: won ? "var(--fx-long)" : "var(--fx-short)" }}>
          {pips(trade.pips)}
        </td>
        <td
          className="num"
          style={{ color: won ? "var(--fx-long)" : "var(--fx-short)", fontWeight: 600 }}
        >
          {usd(trade.usd)}
        </td>
        <td className="num muted">{trade.r === null ? "—" : ratio(trade.r)}</td>
        <td className="muted" style={{ textTransform: "capitalize" }}>
          {trade.exitReason}
        </td>
        <td className="num muted">{duration((trade.closedBar - trade.openedBar) / 60)}</td>
        <td>
          <button
            type="button"
            className="btn"
            style={{ minHeight: 24, padding: "0 8px", fontSize: 11 }}
            onClick={onEdit}
            aria-expanded={editing}
          >
            {trade.tags.length > 0 || trade.note ? "Notes ✓" : "Notes"}
          </button>
        </td>
      </tr>

      {editing && (
        <tr>
          <td colSpan={9} style={{ background: "var(--fx-ink)", whiteSpace: "normal" }}>
            <div style={{ padding: "12px 4px" }}>
              <div style={{ fontSize: 11.5, color: "var(--fx-muted)", marginBottom: 8 }}>
                Ran {pips(trade.mfePips)} in favour and {pips(trade.maePips)} against before it
                closed.
                {trade.entryScore !== null && " The setup scored " + trade.entryScore + "."}
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                {RISK_TAGS.map((tag) => {
                  const on = tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={"chip " + (on ? "chip-tape" : "")}
                      style={{ cursor: "pointer", border: on ? undefined : "1px solid var(--fx-rule)" }}
                      onClick={() => setTags(on ? tags.filter((t) => t !== tag) : [...tags, tag])}
                      aria-pressed={on}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What happened, in your own words."
                style={{ fontFamily: "inherit", marginBottom: 8 }}
              />

              <button
                type="button"
                className="btn btn-accent"
                disabled={!signedIn || saving}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save notes"}
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
