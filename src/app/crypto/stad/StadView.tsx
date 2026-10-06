"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, Time } from "lightweight-charts";
import { useJson } from "../lib/useJson.ts";
import type { StadPayload } from "../lib/types.ts";
import { date, price } from "../lib/format.ts";
import { ErrorNote } from "../ui/bits.tsx";
import { BandsPrimitive, RANGES, createCxChart, showRange } from "../ui/lw.ts";

/* BTC STAD: Short-Term Accumulation & Distribution.

   Top pane, Bitcoin's price for context. Bottom pane, STH-SOPR — the ratio
   of the price recent buyers sell at to the price they paid. The white line
   at 1.00 is the pivot between selling at a loss and selling at a profit.
   Circles mark the extreme day of each excursion past a zone line. */

type Signal = { t: number; kind: "distribution" | "accumulation"; value: number; price: number | null };

/** The most extreme day of each run beyond the upper or lower line. */
function signalsOf(data: StadPayload): Signal[] {
  const out: Signal[] = [];
  let run: Signal | null = null;
  for (const [t, v, p] of data.points) {
    const kind = v >= data.upper ? "distribution" : v <= data.lower ? "accumulation" : null;
    if (kind && run && run.kind === kind) {
      if ((kind === "distribution" && v > run.value) || (kind === "accumulation" && v < run.value)) run = { t, kind, value: v, price: p };
      continue;
    }
    if (run) out.push(run);
    run = kind ? { t, kind, value: v, price: p } : null;
  }
  if (run) out.push(run);
  return out;
}

export default function StadView() {
  const { data, error } = useJson<StadPayload>("/api/crypto/stad");
  const box = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState("1Y");
  const [hover, setHover] = useState<{ t: number; v: number | null; p: number | null } | null>(null);

  const signals = useMemo(() => (data ? signalsOf(data) : []), [data]);

  useEffect(() => {
    if (!data || !box.current) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    void (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !box.current) return;
      chart = createCxChart(lib, box.current);
      chartRef.current = chart;
      const { LineSeries, LineStyle, PriceScaleMode, createSeriesMarkers } = lib;

      const priceSeries = chart.addSeries(LineSeries, {
        color: "#e8ebef",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "BTC",
        priceFormat: { type: "price", precision: 0, minMove: 1 },
      });
      chart.priceScale("right", 0).applyOptions({ mode: PriceScaleMode.Logarithmic });
      priceSeries.setData(
        data.points.filter((p) => p[2] !== null).map((p) => ({ time: p[0] as Time, value: p[2] as number }))
      );

      const stad = chart.addSeries(
        LineSeries,
        { color: "#f0b23a", lineWidth: 1, priceLineVisible: false, title: "STAD", priceFormat: { type: "price", precision: 4, minMove: 0.0001 } },
        1
      );
      stad.setData(data.points.map((p) => ({ time: p[0] as Time, value: p[1] })));
      stad.attachPrimitive(
        new BandsPrimitive(
          [
            { from: data.upper, to: Infinity, color: "rgba(242,54,69,0.13)", label: "BEGIN DISTRIBUTION, TAKE PROFIT", labelColor: "rgba(255,139,149,0.85)" },
            { from: -Infinity, to: data.lower, color: "rgba(34,171,148,0.13)", label: "SLOWLY ACCUMULATE, BUY SPOT", labelColor: "rgba(111,220,200,0.9)" },
          ],
          "center"
        )
      );
      stad.createPriceLine({ price: 1, color: "rgba(232,235,239,0.7)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "" });
      stad.createPriceLine({ price: data.upper, color: "#f23645", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      stad.createPriceLine({ price: data.lower, color: "#22ab94", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      // A fixed range, so the zone lines sit in the same place at every zoom.
      // The odd outlier (the feed has a couple of days above 1.5) runs off the
      // top instead of flattening everything else into a line.
      const lo = data.lower - 0.045;
      const hi = data.upper + 0.045;
      stad.applyOptions({
        autoscaleInfoProvider: () => ({ priceRange: { minValue: lo, maxValue: hi } }),
      });

      const marker = (s: Signal) => ({
        time: s.t as Time,
        position: "inBar" as const,
        shape: "circle" as const,
        color: s.kind === "distribution" ? "#f23645" : "#22ab94",
        size: 1.4,
      });
      createSeriesMarkers(stad, signals.map(marker));
      createSeriesMarkers(priceSeries, signals.filter((s) => s.price !== null).map(marker));

      const panes = chart.panes();
      const h = box.current.clientHeight;
      if (panes[1]) {
        panes[0].setHeight(Math.round(h * 0.58));
        panes[1].setHeight(Math.round(h * 0.42));
      }

      const byTime = new Map(data.points.map((p) => [p[0], p]));
      chart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          setHover(null);
          return;
        }
        const p = byTime.get(param.time as number);
        setHover(p ? { t: p[0], v: p[1], p: p[2] } : null);
      });

      showRange(chart, data.points[data.points.length - 1][0], 365);
    })();
    return () => {
      disposed = true;
      chartRef.current = null;
      chart?.remove();
    };
  }, [data, signals]);

  const last = data?.points[data.points.length - 1];
  const lastSignal = signals[signals.length - 1];
  const zone = !last || !data ? null : last[1] >= data.upper ? "distribution" : last[1] <= data.lower ? "accumulation" : last[1] >= 1 ? "profit" : "loss";
  const shown = hover ?? (last ? { t: last[0], v: last[1], p: last[2] } : null);

  return (
    <main className="cx-main">
      <div className="cx-page-head">
        <div>
          <h1>BTC short-term accumulation &amp; distribution</h1>
          <p>
            STAD tracks short-term holder SOPR: whether people who bought Bitcoin in the last 155 days are selling at a
            profit or at a loss. It flips between capitulation and profit-taking, and those flips are the signals.
          </p>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {!data && !error && <div className="cx-skeleton" style={{ height: 560 }} aria-busy="true" />}

      {data && last && (
        <>
          <div className="cx-cards">
            <div className="cx-card">
              <div className="label">STAD (STH-SOPR)</div>
              <div className="value mono">{last[1].toFixed(4)}</div>
              <div className="note">{date(last[0])} · the free feed runs {data.lagDays} days behind</div>
            </div>
            <div className="cx-card">
              <div className="label">Zone</div>
              <div
                className="value"
                style={{ color: zone === "distribution" ? "#ff8b95" : zone === "accumulation" ? "#6fdcc8" : "var(--cx-text)" }}
              >
                {zone === "distribution" ? "Distribution" : zone === "accumulation" ? "Accumulation" : zone === "profit" ? "Selling in profit" : "Selling at a loss"}
              </div>
              <div className="note">
                Lines at {data.lower} (accumulate) and {data.upper} (take profit)
              </div>
            </div>
            <div className="cx-card">
              <div className="label">Last signal</div>
              <div className="value" style={{ color: lastSignal?.kind === "distribution" ? "#ff8b95" : "#6fdcc8" }}>
                {lastSignal ? (lastSignal.kind === "distribution" ? "Take profit" : "Accumulate") : "—"}
              </div>
              <div className="note">
                {lastSignal ? `${date(lastSignal.t)} · STAD ${lastSignal.value.toFixed(4)} · BTC ${price(lastSignal.price)}` : "None in this history"}
              </div>
            </div>
            <div className="cx-card">
              <div className="label">BTC price</div>
              <div className="value mono">{price(last[2])}</div>
              <div className="note">Daily close on {date(last[0])}</div>
            </div>
          </div>

          <section className="cx-panel" style={{ overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--cx-rule-soft)" }}>
              <div className="cx-seg" role="group" aria-label="Range">
                {RANGES.map((r) => (
                  <button
                    key={r.label}
                    type="button"
                    aria-pressed={range === r.label}
                    onClick={() => {
                      setRange(r.label);
                      if (chartRef.current) showRange(chartRef.current, last[0], r.days);
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {shown && (
                <span className="mono" style={{ fontSize: 12.5, marginLeft: "auto", display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span className="muted">{date(shown.t)}</span>
                  <span>BTC {price(shown.p)}</span>
                  <span style={{ color: "#f0b23a" }}>STAD {shown.v?.toFixed(4) ?? "—"}</span>
                </span>
              )}
            </div>
            <div ref={box} style={{ height: "min(620px, 72dvh)", minHeight: 420 }} />
            <div className="cx-legend" style={{ padding: "8px 14px 10px" }}>
              <span>
                <i style={{ background: "#e8ebef" }} /> BTC price (log)
              </span>
              <span>
                <i style={{ background: "#f0b23a" }} /> STAD
              </span>
              <span>
                <i style={{ background: "#f23645", width: 9, height: 9, borderRadius: "50%" }} /> Distribution signal
              </span>
              <span>
                <i style={{ background: "#22ab94", width: 9, height: 9, borderRadius: "50%" }} /> Accumulation signal
              </span>
            </div>
          </section>

          <section className="cx-panel cx-note" style={{ padding: "16px 18px" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: 16, color: "var(--cx-text)" }}>How to use this chart (a daily framework, not a macro indicator)</h2>
            <p style={{ margin: "0 0 12px" }}>
              Use it for day-to-day and week-to-week context and for managing spot positions, not to call cycle tops and
              bottoms — the cycles page does that job.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              <div className="cx-card">
                <b>What you are looking at</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>Top pane: Bitcoin price, for context.</li>
                  <li>Bottom pane: STAD, the signal.</li>
                  <li>Zone lines: green is the accumulation boundary, red the profit-taking one.</li>
                </ul>
              </div>
              <div className="cx-card">
                <b>The 1.00 pivot</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>Above 1.00, short-term holders sell in profit; far above, that becomes distribution.</li>
                  <li>Below 1.00, they sell at a loss; far below is capitulation, historically a good time to add slowly.</li>
                  <li>In bull markets 1.00 tends to act as support, in bear markets as resistance.</li>
                </ul>
              </div>
              <div className="cx-card">
                <b>Data</b>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  <li>STH-SOPR from BGeometrics (bitcoin-data.com), free tier: daily, from October 2022, {data.lagDays} days behind.</li>
                  <li>Circles mark the most extreme day of each move past a line. Not financial advice.</li>
                </ul>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
