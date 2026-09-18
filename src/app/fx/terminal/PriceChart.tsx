"use client";

import { useEffect, useRef } from "react";
import type { Candle, Setup, Analog, Position } from "../types.ts";
import { T, O, H, L, C } from "../types.ts";
import { rsiSeries, macdSeries } from "./clientIndicators.ts";

/* The chart.

   Lightweight Charts is TradingView's own open-source renderer, which is why
   this looks like their chart without pretending to be it. Three panes: price,
   RSI, MACD — the same layout the setups are reasoned about in, so what the
   score describes is what you see.

   Everything happens in an effect. The library is canvas-only and touches
   `document` on construction, so it is imported dynamically and never runs
   during server rendering.

   Indicators are recomputed on the client from the same candles rather than
   shipped down from the server. They are cheap, and this way the line on the
   chart cannot drift out of step with the bars it is drawn over. */

interface PriceChartProps {
  candles: Candle[];
  setups: Setup[];
  positions: Position[];
  /** When set, its forward path is drawn as a ghost from the last bar. */
  hoveredAnalog: Analog | null;
  selectedSetupId: string | null;
  onSelectSetup: (id: string | null) => void;
  height?: number;
}

interface ChartRefs {
  chart: unknown;
  dispose: () => void;
  update: (props: PriceChartProps) => void;
}

export default function PriceChart({
  candles,
  setups,
  positions,
  hoveredAnalog,
  selectedSetupId,
  onSelectSetup,
  height = 520,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const refsRef = useRef<ChartRefs | null>(null);
  // The newest props, readable from inside the chart's own callbacks without
  // rebuilding the chart every render.
  const propsRef = useRef<PriceChartProps>({
    candles,
    setups,
    positions,
    hoveredAnalog,
    selectedSetupId,
    onSelectSetup,
  });
  propsRef.current = { candles, setups, positions, hoveredAnalog, selectedSetupId, onSelectSetup };

  // Build the chart once, then feed it data through `update`.
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    void (async () => {
      const lib = await import("lightweight-charts");
      if (cancelled || !containerRef.current) return;

      const {
        createChart,
        CandlestickSeries,
        LineSeries,
        HistogramSeries,
        createSeriesMarkers,
        ColorType,
        LineStyle,
        CrosshairMode,
      } = lib;

      const styles = getComputedStyle(container);
      const colour = (name: string, fallback: string) =>
        styles.getPropertyValue(name).trim() || fallback;

      const ink = colour("--fx-ink", "#0f1419");
      const text = colour("--fx-muted", "#8a97a6");
      const rule = colour("--fx-rule-soft", "#1f2832");
      const long = colour("--fx-long", "#2fbf71");
      const short = colour("--fx-short", "#e5484d");
      const tape = colour("--fx-tape", "#f5b82e");

      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: ink },
          textColor: text,
          fontFamily: styles.fontFamily,
          attributionLogo: false,
          panes: { separatorColor: rule, separatorHoverColor: rule },
        },
        grid: {
          vertLines: { color: rule },
          horzLines: { color: rule },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: text, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3542" },
          horzLine: { color: text, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3542" },
        },
        rightPriceScale: { borderColor: rule, scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: {
          borderColor: rule,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
        },
        autoSize: true,
      });

      // Pane 0: price.
      const priceSeries = chart.addSeries(CandlestickSeries, {
        upColor: long,
        downColor: short,
        borderUpColor: long,
        borderDownColor: short,
        wickUpColor: long,
        wickDownColor: short,
        priceFormat: { type: "price", precision: 5, minMove: 0.00001 },
      });

      // Pane 1: RSI, with its own 30/70 guides.
      const rsiLine = chart.addSeries(
        LineSeries,
        {
          color: tape,
          lineWidth: 1,
          priceFormat: { type: "price", precision: 1, minMove: 0.1 },
          priceScaleId: "rsi",
        },
        1,
      );
      for (const level of [30, 50, 70]) {
        rsiLine.createPriceLine({
          price: level,
          color: level === 50 ? rule : "#3a4756",
          lineWidth: 1,
          lineStyle: level === 50 ? LineStyle.Dotted : LineStyle.Dashed,
          axisLabelVisible: level !== 50,
          title: "",
        });
      }

      // Pane 2: MACD — histogram plus the two lines.
      const macdHist = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: "price", precision: 5, minMove: 0.00001 }, priceScaleId: "macd" },
        2,
      );
      const macdLine = chart.addSeries(
        LineSeries,
        { color: "#4a9eff", lineWidth: 1, priceScaleId: "macd", priceLineVisible: false },
        2,
      );
      const macdSignal = chart.addSeries(
        LineSeries,
        { color: tape, lineWidth: 1, priceScaleId: "macd", priceLineVisible: false },
        2,
      );

      // The ghost: an analog's forward path projected from the last close.
      const ghost = chart.addSeries(LineSeries, {
        color: tape,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });

      const markers = createSeriesMarkers(priceSeries, []);

      // Pane heights: price dominates, the oscillators get a readable strip.
      const panes = chart.panes();
      if (panes.length >= 3) {
        panes[0].setHeight(Math.round(height * 0.6));
        panes[1].setHeight(Math.round(height * 0.2));
        panes[2].setHeight(Math.round(height * 0.2));
      }

      let priceLines: ReturnType<typeof priceSeries.createPriceLine>[] = [];
      let lastCandleCount = 0;

      const update = (next: PriceChartProps) => {
        const data = next.candles;
        if (data.length === 0) return;

        priceSeries.setData(
          data.map((c) => ({
            time: c[T] as never,
            open: c[O],
            high: c[H],
            low: c[L],
            close: c[C],
          })),
        );

        const closes = data.map((c) => c[C]);
        const rsi = rsiSeries(closes, 14);
        const macd = macdSeries(closes, 12, 26, 9);

        rsiLine.setData(
          data
            .map((c, i) => ({ time: c[T] as never, value: rsi[i] }))
            .filter((p) => Number.isFinite(p.value)),
        );
        macdHist.setData(
          data
            .map((c, i) => ({
              time: c[T] as never,
              value: macd.histogram[i],
              color: macd.histogram[i] >= 0 ? long + "99" : short + "99",
            }))
            .filter((p) => Number.isFinite(p.value)),
        );
        macdLine.setData(
          data
            .map((c, i) => ({ time: c[T] as never, value: macd.macd[i] }))
            .filter((p) => Number.isFinite(p.value)),
        );
        macdSignal.setData(
          data
            .map((c, i) => ({ time: c[T] as never, value: macd.signal[i] }))
            .filter((p) => Number.isFinite(p.value)),
        );

        // Setup markers: an arrow under a long, over a short, amber when it is
        // the one selected so the chart and the list agree about what is being
        // looked at.
        markers.setMarkers(
          next.setups.map((setup) => ({
            time: setup.barTime as never,
            position: setup.direction === "long" ? "belowBar" : "aboveBar",
            color: setup.id === next.selectedSetupId ? tape : setup.direction === "long" ? long : short,
            shape: setup.direction === "long" ? "arrowUp" : "arrowDown",
            text: String(setup.score),
          })),
        );

        // Open positions get their levels drawn on the price scale.
        for (const line of priceLines) priceSeries.removePriceLine(line);
        priceLines = [];
        for (const position of next.positions) {
          priceLines.push(
            priceSeries.createPriceLine({
              price: position.entry,
              color: position.direction === "long" ? long : short,
              lineWidth: 1,
              lineStyle: LineStyle.Solid,
              axisLabelVisible: true,
              title: position.direction === "long" ? "Long" : "Short",
            }),
          );
          if (position.stop !== null) {
            priceLines.push(
              priceSeries.createPriceLine({
                price: position.stop,
                color: short,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: "Stop",
              }),
            );
          }
          if (position.target !== null) {
            priceLines.push(
              priceSeries.createPriceLine({
                price: position.target,
                color: long,
                lineWidth: 1,
                lineStyle: LineStyle.Dashed,
                axisLabelVisible: true,
                title: "Target",
              }),
            );
          }
        }

        // The ghost path: take the analog's forward shape, rescale it to the
        // current price and ATR, and lay it beyond the last bar so the two are
        // directly comparable.
        if (next.hoveredAnalog && next.hoveredAnalog.forwardShape.length > 0) {
          const lastBar = data[data.length - 1];
          const barSeconds =
            data.length > 1 ? data[data.length - 1][T] - data[data.length - 2][T] : 3600;
          const shape = next.hoveredAnalog.shape;
          const forward = next.hoveredAnalog.forwardShape;
          // The shapes are normalised 0..1 over the analog's own range; anchor
          // the projection at the current close and scale by recent range.
          const anchor = shape.length > 0 ? shape[shape.length - 1] : 0.5;
          const recent = data.slice(-50);
          const hi = Math.max(...recent.map((c) => c[H]));
          const lo = Math.min(...recent.map((c) => c[L]));
          const span = hi - lo || lastBar[C] * 0.001;

          ghost.setData([
            { time: lastBar[T] as never, value: lastBar[C] },
            ...forward.map((v, i) => ({
              time: (lastBar[T] + (i + 1) * barSeconds) as never,
              value: lastBar[C] + (v - anchor) * span,
            })),
          ]);
        } else {
          ghost.setData([]);
        }

        // Only reset the viewport when the series is replaced wholesale (a
        // timeframe change); a poll must not yank the user's scroll position.
        if (data.length !== lastCandleCount && Math.abs(data.length - lastCandleCount) > 5) {
          chart.timeScale().fitContent();
        }
        lastCandleCount = data.length;
      };

      chart.subscribeClick((param) => {
        if (!param.time) return;
        const current = propsRef.current;
        const clicked = current.setups.find((s) => s.barTime === Number(param.time));
        current.onSelectSetup(clicked ? clicked.id : null);
      });

      update(propsRef.current);

      refsRef.current = {
        chart,
        dispose: () => chart.remove(),
        update,
      };
    })();

    return () => {
      cancelled = true;
      refsRef.current?.dispose();
      refsRef.current = null;
    };
    // Built once. Data flows through the update path below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  // Feed new props to the chart without rebuilding it.
  useEffect(() => {
    refsRef.current?.update({
      candles,
      setups,
      positions,
      hoveredAnalog,
      selectedSetupId,
      onSelectSetup,
    });
  }, [candles, setups, positions, hoveredAnalog, selectedSetupId, onSelectSetup]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={
        "EUR/USD candlestick chart with RSI and MACD panes, showing " +
        candles.length +
        " bars and " +
        setups.length +
        " detected setups."
      }
    />
  );
}
