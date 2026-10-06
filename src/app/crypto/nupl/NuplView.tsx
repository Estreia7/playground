"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, Time } from "lightweight-charts";
import { useJson } from "../lib/useJson.ts";
import type { MarketsPayload, NuplPayload } from "../lib/types.ts";
import { date, pctOf, price } from "../lib/format.ts";
import { ErrorNote } from "../ui/bits.tsx";
import { BandsPrimitive, createCxChart, showRange } from "../ui/lw.ts";

/* NUPL: is the market sitting on profit or on loss?

   The line is coloured by its sentiment band, and price runs alongside on
   the right axis. The cost basis behind it is an estimate rebuilt from
   exchange volume (see the note at the bottom), because real on-chain
   realized value is not published free for XRP or most coins. */

const BANDS = [
  { key: "capitulation", label: "Capitulation", from: -Infinity, to: -0.25, color: "#f23645", tint: "rgba(242,54,69,0.10)" },
  { key: "hope", label: "Hope – Fear", from: -0.25, to: 0, color: "#f2783c", tint: "rgba(242,120,60,0.08)" },
  { key: "optimism", label: "Optimism – Anxiety", from: 0, to: 0.25, color: "#f0c43a", tint: "rgba(240,196,58,0.07)" },
  { key: "belief", label: "Belief – Denial", from: 0.25, to: 0.5, color: "#3fbf6a", tint: "rgba(63,191,106,0.07)" },
  { key: "euphoria", label: "Euphoria – Greed", from: 0.5, to: Infinity, color: "#4a9df0", tint: "rgba(74,157,240,0.09)" },
];

function bandOf(v: number) {
  return BANDS.find((b) => v >= b.from && v < b.to) ?? BANDS[0];
}

function profitLabel(v: number): { text: string; note: string } {
  if (v < -0.25) return { text: "Deep loss", note: "most holders are well under water" };
  if (v < 0) return { text: "Unrealized loss", note: "the average holder is under water" };
  if (v < 0.1) return { text: "Limited profit", note: "profits are present but modest" };
  if (v < 0.35) return { text: "Healthy profit", note: "most holders are comfortably in profit" };
  return { text: "Large profit", note: "holders are sitting on big gains" };
}

const ZOOMS: { label: string; days: number | null | "ytd" }[] = [
  { label: "1m", days: 31 },
  { label: "3m", days: 92 },
  { label: "6m", days: 183 },
  { label: "YTD", days: "ytd" },
  { label: "1y", days: 365 },
  { label: "All", days: null },
];

export default function NuplView() {
  const params = useSearchParams();
  const router = useRouter();
  const asset = (params.get("asset") ?? "XRP").toUpperCase();
  const { data, error } = useJson<NuplPayload>(`/api/crypto/nupl?asset=${asset}`);
  const { data: markets } = useJson<MarketsPayload>("/api/crypto/markets");
  const box = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [zoom, setZoom] = useState("All");
  const [hover, setHover] = useState<[number, number, number, number] | null>(null);

  const options = useMemo(() => {
    const list = markets?.coins.filter((c) => c.binance).map((c) => ({ symbol: c.symbol, name: c.name })) ?? [];
    return list.some((o) => o.symbol === asset) ? list : [{ symbol: asset, name: asset }, ...list];
  }, [markets, asset]);

  useEffect(() => {
    if (!data || !box.current || !data.points.length) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    void (async () => {
      const lib = await import("lightweight-charts");
      if (disposed || !box.current) return;
      chart = createCxChart(lib, box.current, { leftScale: true });
      chartRef.current = chart;
      const { LineSeries, LineStyle, PriceScaleMode } = lib;

      const nupl = chart.addSeries(LineSeries, {
        priceScaleId: "left",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: "NUPL",
        priceFormat: { type: "price", precision: 3, minMove: 0.001 },
      });
      nupl.setData(data.points.map((p) => ({ time: p[0] as Time, value: p[2], color: bandOf(p[2]).color })));
      nupl.attachPrimitive(
        new BandsPrimitive(BANDS.map((b) => ({ from: b.from, to: b.to, color: b.tint, label: b.label, labelColor: b.color })))
      );
      // Readings below -1.5 (deep crashes the estimate exaggerates) run off the
      // bottom rather than squashing the bands everyone reads into a sliver.
      const values = data.points.map((p) => p[2]);
      const lo = Math.max(-1.5, Math.min(...values) - 0.05);
      const hi = Math.max(0.8, Math.max(...values) + 0.05);
      nupl.applyOptions({ autoscaleInfoProvider: () => ({ priceRange: { minValue: lo, maxValue: hi } }) });
      nupl.createPriceLine({ price: 0, color: "rgba(232,235,239,0.45)", lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });

      const priceLine = chart.addSeries(LineSeries, {
        color: "rgba(232,235,239,0.9)",
        lineWidth: 1,
        priceLineVisible: false,
        title: data.symbol,
      });
      chart.priceScale("right").applyOptions({ mode: PriceScaleMode.Logarithmic });
      priceLine.setData(data.points.map((p) => ({ time: p[0] as Time, value: p[1] })));

      const byTime = new Map(data.points.map((p) => [p[0], p]));
      chart.subscribeCrosshairMove((param) => {
        const p = param.time ? byTime.get(param.time as number) : undefined;
        setHover(p ?? null);
      });
      chart.timeScale().fitContent();
    })();
    return () => {
      disposed = true;
      chartRef.current = null;
      chart?.remove();
    };
  }, [data]);

  const applyZoom = (z: (typeof ZOOMS)[number]) => {
    setZoom(z.label);
    const chart = chartRef.current;
    const lastT = data?.points[data.points.length - 1]?.[0];
    if (!chart || !lastT) return;
    if (z.days === "ytd") {
      const start = Date.UTC(new Date(lastT * 1000).getUTCFullYear(), 0, 1) / 1000;
      showRange(chart, lastT, Math.ceil((lastT - start) / 86400));
    } else showRange(chart, lastT, z.days);
  };

  const last = data?.points[data.points.length - 1];
  const shown = hover ?? last ?? null;

  return (
    <main className="cx-main">
      <div className="cx-page-head">
        <div>
          <h1>{data?.name ?? asset} net unrealized profit/loss (NUPL)</h1>
          <p>
            Track {data?.name ?? asset}&apos;s price alongside NUPL to see whether the wider market is holding unrealized
            profit or unrealized loss — and how stretched that is.
          </p>
        </div>
        <div>
          <label className="sr-only" htmlFor="nupl-asset">Asset</label>
          <select
            id="nupl-asset"
            className="cx-select"
            value={asset}
            onChange={(e) => router.replace(`/crypto/nupl?asset=${e.target.value}`, { scroll: false })}
            style={{ minWidth: 170 }}
          >
            {options.map((o) => (
              <option key={o.symbol} value={o.symbol}>
                {o.name === o.symbol ? o.symbol : `${o.name} (${o.symbol})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <ErrorNote message={error} />}
      {!data && !error && <div className="cx-skeleton" style={{ height: 520 }} aria-busy="true" />}

      {data && last && (
        <>
          <Cards point={last} symbol={data.symbol} />
          <section className="cx-panel" style={{ overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--cx-rule-soft)" }}>
              <span className="faint" style={{ fontSize: 12 }}>
                Zoom
              </span>
              <div className="cx-seg" role="group" aria-label="Zoom">
                {ZOOMS.map((z) => (
                  <button key={z.label} type="button" aria-pressed={zoom === z.label} onClick={() => applyZoom(z)}>
                    {z.label}
                  </button>
                ))}
              </div>
              {shown && (
                <span className="mono" style={{ fontSize: 12.5, marginLeft: "auto", display: "flex", gap: 14, flexWrap: "wrap" }}>
                  <span className="muted">{date(shown[0])}</span>
                  <span>
                    {data.symbol} {price(shown[1])}
                  </span>
                  <span style={{ color: bandOf(shown[2]).color }}>NUPL {shown[2].toFixed(3)}</span>
                </span>
              )}
            </div>
            <div ref={box} style={{ height: "min(560px, 66dvh)", minHeight: 380 }} />
            <div className="cx-legend" style={{ padding: "8px 14px 10px" }}>
              {BANDS.map((b) => (
                <span key={b.key}>
                  <i style={{ background: b.color }} /> {b.label}
                </span>
              ))}
              <span>
                <i style={{ background: "#e8ebef" }} /> {data.symbol} price (right, log)
              </span>
            </div>
          </section>

          <section className="cx-panel cx-note" style={{ padding: "14px 18px" }}>
            <h2 className="cx-eyebrow" style={{ marginBottom: 8 }}>
              An estimate — how it is made
            </h2>
            <p style={{ margin: "0 0 6px" }}>
              Real NUPL compares market value with <b>realized value</b>: what every coin was worth when it last moved
              on-chain. That index is not published free for {data.symbol}, so this page rebuilds a cost basis from Binance
              volume. Each day a share of the supply is treated as changing hands at that day&apos;s average price —{" "}
              {Math.round(data.turnover * 100)}% of the traded volume, measured against a circulating supply of{" "}
              {Math.round(data.supply / 1e6).toLocaleString("en-US")}M {data.symbol}.
            </p>
            <p style={{ margin: "0 0 6px" }}>
              The estimate has to start from the first day&apos;s price, which is badly off for a coin listed mid-crash, so
              the line starts on {date(data.points[0][0])} — once less than a quarter of the cost basis still comes from that
              first guess{data.historyFrom ? ` (Binance history begins ${date(data.historyFrom)})` : ""}. The axis stops at −1.5;
              deeper readings after crashes run off the bottom.
            </p>
            <p style={{ margin: 0 }}>
              NUPL = 1 − cost basis ÷ price, and MVRV = price ÷ cost basis. The turnover share was tuned against published
              XRP readings for 2024–2026, so it tracks the shape well but individual values can differ from on-chain
              providers. Not financial advice.
            </p>
          </section>
        </>
      )}
    </main>
  );
}

function Cards({ point, symbol }: { point: [number, number, number, number]; symbol: string }) {
  const [t, close, nupl, cost] = point;
  const mvrv = close / cost;
  const band = bandOf(nupl);
  const profit = profitLabel(nupl);
  return (
    <div className="cx-cards">
      <div className="cx-card">
        <div className="label">{symbol} price</div>
        <div className="value mono">{price(close)}</div>
        <div className="note">{date(t, { day: "numeric", month: "long", year: "numeric" })}</div>
      </div>
      <div className="cx-card">
        <div className="label">Holder profitability</div>
        <div className="value" style={{ color: band.color }}>
          {profit.text}
        </div>
        <div className="note">
          NUPL {nupl.toFixed(4)} — {profit.note}
        </div>
      </div>
      <div className="cx-card">
        <div className="label">Price vs cost basis</div>
        <div className="value" style={{ color: mvrv >= 1 ? "var(--cx-up)" : "var(--cx-down)" }}>
          {pctOf(Math.abs(mvrv - 1)).replace("+", "")} {mvrv >= 1 ? "above" : "below"}
        </div>
        <div className="note">
          MVRV {mvrv.toFixed(4)} — estimated cost basis {price(cost)}
        </div>
      </div>
      <div className="cx-card">
        <div className="label">Market condition</div>
        <div className="value" style={{ color: band.color }}>
          {band.label}
        </div>
        <div className="note">{conditionNote(band.key)}</div>
      </div>
    </div>
  );
}

function conditionNote(key: string): string {
  switch (key) {
    case "capitulation":
      return "Most holders are in loss; historically where long-term bottoms form.";
    case "hope":
      return "Slightly under water overall; fear still outweighs conviction.";
    case "optimism":
      return "The market is profitable, but conviction remains limited.";
    case "belief":
      return "Solid profits across holders; trend-following conviction.";
    default:
      return "Large unrealized gains; historically where cycle tops form.";
  }
}
