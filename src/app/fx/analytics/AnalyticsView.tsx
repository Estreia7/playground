"use client";

import { useEffect, useMemo, useState } from "react";
import type { Analytics, Breakdown, LossReason } from "../../api/fx/paper/analytics.ts";
import type { Trade } from "../types.ts";
import { usd, money, pct, pips, ratio, barTime, duration } from "../format.ts";
import { Panel, Stat, Notice, DirectionTag } from "../ui/parts.tsx";

/* Analytics: did it work, and if not, why not.

   The KPIs at the top are the standard ones. The part worth building is
   underneath: the losses sorted by cause. "You lost fourteen trades" is not
   something anyone can act on. "Nine of them were already a full unit of risk
   in profit before they came back and stopped you out" is — that is an exit
   problem, and it has a specific fix.

   Charts are hand-drawn SVG, in keeping with the rest of the playground and
   because these are simple shapes that do not justify a charting dependency
   on top of the one the terminal already loads. */

export default function AnalyticsView() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/fx/analytics", { cache: "no-store" });
        const body = await response.json();
        if (response.ok) setData(body.analytics as Analytics);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <Notice title="Working through the trades…" />;
  if (!data || data.kpis.trades === 0) {
    return (
      <Panel>
        <Notice title="No closed trades to analyse yet">
          Take a few setups in the paper account and come back. Once trades close, this page breaks
          them down by timeframe, session, score and evidence, and sorts the losses by what actually
          went wrong.
        </Notice>
      </Panel>
    );
  }

  const { kpis } = data;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel title="How it has gone">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(108px, 1fr))",
            gap: 16,
            padding: 14,
          }}
        >
          <Stat label="Trades" value={String(kpis.trades)} />
          <Stat
            label="Win rate"
            value={pct(kpis.winRate)}
            tone={kpis.winRate >= 0.5 ? "long" : "neutral"}
          />
          <Stat
            label="Net result"
            value={usd(kpis.totalUsd)}
            tone={kpis.totalUsd >= 0 ? "long" : "short"}
          />
          <Stat
            label="Profit factor"
            value={kpis.profitFactor === null ? "—" : ratio(kpis.profitFactor)}
            tone={kpis.profitFactor !== null && kpis.profitFactor > 1 ? "long" : "short"}
            hint="Gross profit divided by gross loss. Above 1 means the winners paid for the losers."
          />
          <Stat
            label="Average R"
            value={kpis.avgR === null ? "—" : ratio(kpis.avgR)}
            tone={kpis.avgR !== null && kpis.avgR > 0 ? "long" : "short"}
            hint="The average result measured in units of what was risked."
          />
          <Stat
            label="Per trade"
            value={usd(kpis.expectancyUsd)}
            tone={kpis.expectancyUsd >= 0 ? "long" : "short"}
          />
          <Stat
            label="Worst drawdown"
            value={money(kpis.maxDrawdownUsd)}
            tone="short"
            hint="The largest fall from a peak in the balance."
          />
          <Stat label="Average hold" value={duration(kpis.avgHoldMinutes)} />
        </div>
      </Panel>

      <Panel title="Equity">
        <EquityCurve data={data} />
      </Panel>

      {data.lossReasons.length > 0 && <LossPanel reasons={data.lossReasons} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: 12,
        }}
      >
        <BreakdownPanel title="By timeframe" rows={data.byTimeframe} />
        <BreakdownPanel title="By direction" rows={data.byDirection} />
        <BreakdownPanel
          title="By setup score"
          rows={data.byScore}
          hint="If the high scores do not outperform the low ones, the scoring is not earning its keep."
        />
        <BreakdownPanel title="By session" rows={data.bySession} />
        <BreakdownPanel title="By weekday" rows={data.byWeekday} />
        <BreakdownPanel
          title="By evidence"
          rows={data.byEvidence}
          hint="Which signals actually made money. Worst first."
        />
      </div>

      {data.worstTrades.length > 0 && <WorstTrades trades={data.worstTrades} />}
    </div>
  );
}

/* The equity curve, with the drawdown shaded.

   Drawdown is the shape that matters here: two accounts can finish at the same
   number having felt completely different on the way. */
function EquityCurve({ data }: { data: Analytics }) {
  const points = data.equity;
  const W = 900;
  const H = 200;
  const PAD = 8;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const values = points.flatMap((p) => [p.balance, p.peak]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || 1;

    const x = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
    const y = (v: number) => H - PAD - ((v - lo) / span) * (H - PAD * 2);

    return {
      balance: points.map((p, i) => x(i) + "," + y(p.balance)).join(" "),
      peak: points.map((p, i) => x(i) + "," + y(p.peak)).join(" "),
      // The area between peak and balance is the drawdown.
      shade:
        points.map((p, i) => x(i) + "," + y(p.peak)).join(" ") +
        " " +
        [...points].reverse().map((p, i) => x(points.length - 1 - i) + "," + y(p.balance)).join(" "),
      start: points[0].balance,
      end: points[points.length - 1].balance,
    };
  }, [points]);

  if (!geometry) {
    return <Notice title="Not enough trades to draw a curve yet" />;
  }

  const up = geometry.end >= geometry.start;

  return (
    <div style={{ padding: 14 }}>
      <svg
        viewBox={"0 0 " + W + " " + H}
        width="100%"
        height={H}
        role="img"
        aria-label={
          "Account balance over " +
          points.length +
          " trades, from " +
          money(geometry.start) +
          " to " +
          money(geometry.end) +
          "."
        }
      >
        <polygon points={geometry.shade} fill="var(--fx-short)" opacity="0.1" />
        <polyline
          points={geometry.peak}
          fill="none"
          stroke="var(--fx-rule)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        <polyline
          points={geometry.balance}
          fill="none"
          stroke={up ? "var(--fx-long)" : "var(--fx-short)"}
          strokeWidth="1.75"
        />
      </svg>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--fx-faint)",
          marginTop: 4,
        }}
        className="mono"
      >
        <span>{money(geometry.start)}</span>
        <span className="faint">shaded area is drawdown from the peak</span>
        <span style={{ color: up ? "var(--fx-long)" : "var(--fx-short)" }}>
          {money(geometry.end)}
        </span>
      </div>
    </div>
  );
}

function LossPanel({ reasons }: { reasons: LossReason[] }) {
  return (
    <Panel title="Why the losses happened">
      <div style={{ padding: 14, display: "grid", gap: 12 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--fx-muted)", lineHeight: 1.55 }}>
          A trade can appear in more than one row. These are diagnoses rather than categories, and a
          loss that was both against the trend and given back after a decent run has two things
          worth fixing.
        </p>

        {reasons.map((reason) => (
          <div
            key={reason.key}
            style={{
              padding: "11px 12px",
              background: "var(--fx-ink)",
              border: "1px solid var(--fx-rule)",
              borderRadius: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: 10,
                marginBottom: 4,
              }}
            >
              <strong style={{ fontSize: 13 }}>{reason.label}</strong>
              <span className="mono" style={{ fontSize: 12.5, color: "var(--fx-short)" }}>
                {reason.trades} {reason.trades === 1 ? "trade" : "trades"} · {usd(reason.usd)}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--fx-muted)", lineHeight: 1.5 }}>
              {reason.explanation}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function BreakdownPanel({
  title,
  rows,
  hint,
}: {
  title: string;
  rows: Breakdown[];
  hint?: string;
}) {
  if (rows.length === 0) return null;

  return (
    <Panel title={title}>
      {hint && (
        <p
          style={{
            margin: 0,
            padding: "10px 14px 0",
            fontSize: 11.5,
            color: "var(--fx-faint)",
            lineHeight: 1.45,
          }}
        >
          {hint}
        </p>
      )}
      <div style={{ overflowX: "auto" }} className="thin-scroll">
        <table>
          <thead>
            <tr>
              <th>{title.replace("By ", "")}</th>
              <th className="num">Trades</th>
              <th className="num">Win rate</th>
              <th className="num">Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td style={{ maxWidth: 190, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.label}
                </td>
                <td className="num muted">{row.trades}</td>
                <td className="num">{pct(row.winRate)}</td>
                <td
                  className="num"
                  style={{ color: row.usd >= 0 ? "var(--fx-long)" : "var(--fx-short)", fontWeight: 500 }}
                >
                  {usd(row.usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function WorstTrades({ trades }: { trades: Trade[] }) {
  return (
    <Panel title="The ones that hurt most">
      <div style={{ overflowX: "auto" }} className="thin-scroll">
        <table>
          <thead>
            <tr>
              <th>Closed</th>
              <th>Direction</th>
              <th className="num">Result</th>
              <th className="num">Ran to</th>
              <th className="num">Against</th>
              <th>Exit</th>
              <th>Your notes</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.id}>
                <td className="muted mono" style={{ fontSize: 11 }}>
                  {barTime(trade.closedBar)}
                </td>
                <td>
                  <DirectionTag direction={trade.direction} />
                </td>
                <td
                  className="num"
                  style={{ color: trade.usd >= 0 ? "var(--fx-long)" : "var(--fx-short)", fontWeight: 600 }}
                >
                  {usd(trade.usd)}
                </td>
                <td className="num long">{pips(trade.mfePips)}</td>
                <td className="num short">{pips(trade.maePips)}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>
                  {trade.exitReason}
                </td>
                <td
                  className="muted"
                  style={{ maxWidth: 220, whiteSpace: "normal", fontSize: 11.5, lineHeight: 1.4 }}
                >
                  {trade.tags.join(", ") || trade.note || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
