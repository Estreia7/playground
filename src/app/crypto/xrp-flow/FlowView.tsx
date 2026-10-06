"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, Time } from "lightweight-charts";
import { useJson } from "../lib/useJson.ts";
import type { FlowBucket, FlowPayload } from "../lib/types.ts";
import { compact, date, price } from "../lib/format.ts";
import { ErrorNote } from "../ui/bits.tsx";
import { createCxChart } from "../ui/lw.ts";

/* XRP Smart Flow Index.

   Every XRP payment into or out of a known exchange account on the XRP
   Ledger, bucketed by time. Red bars above zero are inflows (coins sent to
   exchanges, usually to sell), green bars below are outflows (coins taken
   off exchanges), and the violet line is the net. Whale-sized payments are
   counted apart from the rest so the cards can say who is driving it. */

type Interval = "1h" | "4h" | "1d";

const INTERVAL_SECONDS: Record<Interval, number> = { "1h": 3600, "4h": 14400, "1d": 86400 };

function summarise(buckets: FlowBucket[], whale: number) {
  let inW = 0, inS = 0, outW = 0, outS = 0;
  for (const b of buckets) {
    inW += b.inWhale;
    inS += b.inSmall;
    outW += b.outWhale;
    outS += b.outSmall;
  }
  const inflow = inW + inS;
  const outflow = outW + outS;
  const net = inflow - outflow;
  const whaleNet = inW - outW;
  const smallNet = inS - outS;
  const total = inflow + outflow;
  const signal = total === 0 || Math.abs(net) < total * 0.005 ? "Balanced" : net > 0 ? "Net inflow" : "Net outflow";
  let dominance = "No flow yet";
  let dominanceNote = "";
  if (whaleNet !== 0 || smallNet !== 0) {
    const whales = Math.abs(whaleNet) >= Math.abs(smallNet);
    const n = whales ? whaleNet : smallNet;
    dominance = `${whales ? "Whale" : "Smaller-flow"} ${n > 0 ? "deposits" : "withdrawals"} dominate`;
    dominanceNote = `Payments of ${compact(whale)} XRP or more net ${compact(Math.abs(whaleNet))} XRP ${whaleNet >= 0 ? "inflow" : "outflow"}; smaller payments net ${compact(Math.abs(smallNet))} XRP ${smallNet >= 0 ? "inflow" : "outflow"}.`;
  }
  return { inflow, outflow, net, signal, dominance, dominanceNote };
}

export default function FlowView() {
  const [interval, setIntervalId] = useState<Interval>("1h");
  const { data, error } = useJson<FlowPayload>(`/api/crypto/xrp-flow?interval=${interval}`, 60_000);
  const box = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<{ update: (d: FlowPayload) => void } | null>(null);
  const [hover, setHover] = useState<FlowBucket | null>(null);
  const latest = useRef<FlowPayload | null>(null);

  // Build the chart once per interval; data refreshes go through update().
  useEffect(() => {
    if (!box.current) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    void (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !box.current) return;
      chart = createCxChart(lib, box.current);
      chartRef.current = chart;
      chart.applyOptions({ timeScale: { timeVisible: interval !== "1d", secondsVisible: false } });
      const { CandlestickSeries, HistogramSeries, LineSeries, LineStyle } = lib;
      const candles = chart.addSeries(CandlestickSeries, {
        upColor: "#22ab94",
        downColor: "#f23645",
        borderUpColor: "#22ab94",
        borderDownColor: "#f23645",
        wickUpColor: "#22ab94",
        wickDownColor: "#f23645",
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      });
      const volumeFormat = { type: "custom" as const, formatter: (v: number) => compact(v), minMove: 1 };
      const inflow = chart.addSeries(HistogramSeries, { color: "rgba(242,54,69,0.75)", priceFormat: volumeFormat, priceLineVisible: false, lastValueVisible: false, title: "In" }, 1);
      const outflow = chart.addSeries(HistogramSeries, { color: "rgba(34,171,148,0.75)", priceFormat: volumeFormat, priceLineVisible: false, lastValueVisible: false, title: "Out" }, 1);
      const net = chart.addSeries(LineSeries, { color: "#9b8afb", lineWidth: 2, priceFormat: volumeFormat, priceLineVisible: false, title: "Net" }, 1);
      net.createPriceLine({ price: 0, color: "rgba(232,235,239,0.35)", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false, title: "" });

      const panes = chart.panes();
      const h = box.current.clientHeight;
      if (panes[1]) {
        panes[0].setHeight(Math.round(h * 0.6));
        panes[1].setHeight(Math.round(h * 0.4));
      }

      let byTime = new Map<number, FlowBucket>();
      let first = true;
      seriesRef.current = {
        update(d: FlowPayload) {
          candles.setData(d.candles.map((c) => ({ time: c[0] as Time, open: c[1], high: c[2], low: c[3], close: c[4] })));
          inflow.setData(d.buckets.map((b) => ({ time: b.t as Time, value: b.inWhale + b.inSmall })));
          outflow.setData(d.buckets.map((b) => ({ time: b.t as Time, value: -(b.outWhale + b.outSmall) })));
          net.setData(d.buckets.map((b) => ({ time: b.t as Time, value: b.inWhale + b.inSmall - b.outWhale - b.outSmall })));
          byTime = new Map(d.buckets.map((b) => [b.t, b]));
          if (first) {
            // Open on the span that has flows: early on that is a day or two,
            // and fitting 14 days of candles would squeeze it into a corner.
            const firstFlow = d.buckets[0]?.t;
            const lastCandle = d.candles[d.candles.length - 1]?.[0];
            const span = INTERVAL_SECONDS[d.interval];
            if (firstFlow && lastCandle && lastCandle - firstFlow > span * 12) {
              chart?.timeScale().setVisibleRange({ from: (firstFlow - span * 6) as Time, to: (lastCandle + span) as Time });
            } else chart?.timeScale().fitContent();
            first = false;
          }
        },
      };
      chart.subscribeCrosshairMove((param) => {
        setHover(param.time ? byTime.get(param.time as number) ?? null : null);
      });
      if (latest.current) seriesRef.current.update(latest.current);
    })();
    return () => {
      disposed = true;
      seriesRef.current = null;
      chartRef.current = null;
      chart?.remove();
    };
  }, [interval]);

  useEffect(() => {
    if (!data || data.interval !== interval) return;
    latest.current = data;
    seriesRef.current?.update(data);
  }, [data, interval]);

  const current = data && data.interval === interval ? data : null;
  const summary = useMemo(() => (current ? summarise(current.buckets, current.whaleThreshold) : null), [current]);
  const firstBucket = current?.buckets[0];
  const lastBucket = current?.buckets[current.buckets.length - 1];
  const lastCandle = current?.candles[current.candles.length - 1];

  return (
    <main className="cx-main">
      <div className="cx-page-head">
        <div>
          <h1>XRP smart flow index</h1>
          <p>
            Compares exchange inflows, exchange outflows and whale-sized payments on the XRP Ledger, to show whether large
            holders or smaller participants are driving the dominant flow.
          </p>
        </div>
        <div className="cx-seg" role="group" aria-label="Interval">
          {(["1h", "4h", "1d"] as Interval[]).map((i) => (
            <button key={i} type="button" aria-pressed={interval === i} onClick={() => setIntervalId(i)}>
              {i === "1d" ? "D" : i}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {current && <Status data={current} />}

      <div className="cx-cards">
        <div className="cx-card">
          <div className="label">XRP close</div>
          <div className="value mono">{lastCandle ? price(lastCandle[4]) : "—"}</div>
          <div className="note">
            {firstBucket && lastBucket ? `${date(firstBucket.t)} – ${date(lastBucket.t)}` : "Range appears once flows are collected"}
          </div>
        </div>
        <div className="cx-card">
          <div className="label">Exchange inflow</div>
          <div className="value mono" style={{ color: "#ff8b95" }}>
            {summary ? compact(summary.inflow) + " XRP" : "—"}
          </div>
          <div className="note">XRP flowing into exchange wallets</div>
        </div>
        <div className="cx-card">
          <div className="label">Exchange outflow</div>
          <div className="value mono" style={{ color: "#6fdcc8" }}>
            {summary ? compact(summary.outflow) + " XRP" : "—"}
          </div>
          <div className="note">XRP leaving exchange wallets</div>
        </div>
        <div className="cx-card">
          <div className="label">Smart flow signal</div>
          <div className="value" style={{ color: summary?.signal === "Net inflow" ? "#ff8b95" : summary?.signal === "Net outflow" ? "#6fdcc8" : undefined }}>
            {summary?.signal ?? "—"}
          </div>
          <div className="note">
            {summary ? `Net ${compact(Math.abs(summary.net))} XRP ${summary.net >= 0 ? "deposit pressure" : "leaving exchanges"} across the range.` : ""}
          </div>
        </div>
        <div className="cx-card">
          <div className="label">Smart money dominance</div>
          <div className="value" style={{ fontSize: 16, color: summary?.dominance.includes("deposits") ? "#ff8b95" : summary?.dominance.includes("withdrawals") ? "#6fdcc8" : undefined }}>
            {summary?.dominance ?? "—"}
          </div>
          <div className="note">{summary?.dominanceNote}</div>
        </div>
      </div>

      <section className="cx-panel" style={{ overflow: "hidden", marginBottom: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: "10px 14px", borderBottom: "1px solid var(--cx-rule-soft)", fontSize: 12.5 }}>
          <b>XRP / USDT · Binance</b>
          {hover ? (
            <span className="mono" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <span className="muted">{new Date(hover.t * 1000).toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: interval === "1d" ? undefined : "short" })} UTC</span>
              <span style={{ color: "#ff8b95" }}>In {compact(hover.inWhale + hover.inSmall)}</span>
              <span style={{ color: "#6fdcc8" }}>Out {compact(hover.outWhale + hover.outSmall)}</span>
              <span style={{ color: "#c4b9ff" }}>Net {compact(hover.inWhale + hover.inSmall - hover.outWhale - hover.outSmall)}</span>
              <span className="faint">whales in {compact(hover.inWhale)} · out {compact(hover.outWhale)}</span>
            </span>
          ) : (
            <span className="faint">Hover the chart for each bar&apos;s flows</span>
          )}
        </div>
        <div ref={box} style={{ height: "min(620px, 70dvh)", minHeight: 420 }} />
        <div className="cx-legend" style={{ padding: "8px 14px 10px" }}>
          <span>
            <i style={{ background: "#f23645" }} /> Exchange inflow (up)
          </span>
          <span>
            <i style={{ background: "#22ab94" }} /> Exchange outflow (down)
          </span>
          <span>
            <i style={{ background: "#9b8afb" }} /> Net flow
          </span>
        </div>
      </section>

      <section className="cx-panel cx-note" style={{ padding: "14px 18px" }}>
        <h2 className="cx-eyebrow" style={{ marginBottom: 8 }}>
          Where this comes from
        </h2>
        <p style={{ margin: "0 0 6px" }}>
          The server listens to the XRP Ledger for every payment touching{" "}
          {current ? `${current.status.accounts} accounts of ${current.status.exchanges} exchanges` : "known exchange accounts"} (labels
          from XRPScan&apos;s well-known names). A payment into an exchange from outside is an <b>inflow</b>, the reverse an{" "}
          <b>outflow</b>; transfers between two exchanges are left out. Payments of{" "}
          {current ? compact(current.whaleThreshold) : "1M"} XRP or more count as whale-sized.
        </p>
        <p style={{ margin: 0 }}>
          No free service publishes past XRP exchange flows, so the history starts when the collector first ran (with a few
          days read back from the ledger) and grows from there. Not financial advice.
        </p>
      </section>
    </main>
  );
}

function Status({ data }: { data: FlowPayload }) {
  const s = data.status;
  let text: string;
  let tone = "var(--cx-muted)";
  if (!s.running) {
    text = "The flow collector is not running on this server, so no new flows are being recorded.";
    tone = "#f3c66d";
  } else if (s.backfilling) {
    text = `Reading recent history back from the ledger for ${s.accounts} exchange accounts — this takes a few minutes on first start. Live flows are being held and will appear together with it.`;
    tone = "#f3c66d";
  } else if (!s.connected) {
    text = "Reconnecting to the XRP Ledger…";
    tone = "#f3c66d";
  } else {
    text = `Live · ${s.accounts} exchange accounts · collecting since ${s.since ? date(s.since) : "today"}${s.lastLedger ? ` · ledger ${s.lastLedger.toLocaleString("en-US")}` : ""}`;
  }
  return (
    <p className="cx-panel" role="status" style={{ margin: "0 0 14px", padding: "10px 14px", fontSize: 12.5, color: tone, display: "flex", gap: 8, alignItems: "center" }}>
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: "50%", background: s.running && s.connected && !s.backfilling ? "#22ab94" : "#f0b23a", flex: "none" }}
      />
      <span>
        {text}
        {s.message && <span className="faint"> {s.message}</span>}
      </span>
    </p>
  );
}
