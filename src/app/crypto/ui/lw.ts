"use client";

import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from "lightweight-charts";

/* Lightweight Charts helpers for the time-series pages (STAD, NUPL, XRP flow).

   The library touches `document` when it loads, so pages import it inside an
   effect; everything here only needs its types, plus the module handed in. */

export type Lib = typeof import("lightweight-charts");

export function createCxChart(lib: Lib, container: HTMLElement, opts: { leftScale?: boolean } = {}): IChartApi {
  const { createChart, ColorType, CrosshairMode, LineStyle } = lib;
  return createChart(container, {
    autoSize: true,
    layout: {
      background: { type: ColorType.Solid, color: "#0d1014" },
      textColor: "#8c939e",
      fontFamily: getComputedStyle(container).fontFamily,
      fontSize: 11,
      attributionLogo: false,
      panes: { separatorColor: "#232830", separatorHoverColor: "#2c323b" },
    },
    grid: { vertLines: { color: "#161a20" }, horzLines: { color: "#161a20" } },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: "#5b626d", style: LineStyle.Dashed, labelBackgroundColor: "#232830" },
      horzLine: { color: "#5b626d", style: LineStyle.Dashed, labelBackgroundColor: "#232830" },
    },
    rightPriceScale: { borderColor: "#232830" },
    leftPriceScale: { visible: !!opts.leftScale, borderColor: "#232830" },
    timeScale: { borderColor: "#232830", rightOffset: 4 },
    localization: { locale: "en-GB" },
  });
}

export interface Band {
  from: number;
  to: number;
  color: string;
  label?: string;
  labelColor?: string;
}

type Target = Parameters<IPrimitivePaneRenderer["draw"]>[0];

/** Horizontal colour bands between price levels of one series, drawn behind
    the lines, with an optional label at the left of each band. Infinite
    bounds run to the edge of the pane. */
export class BandsPrimitive implements ISeriesPrimitive<Time> {
  private series: ISeriesApi<SeriesType> | null = null;
  private readonly view: IPrimitivePaneView;

  constructor(private bands: Band[], private labelAlign: "left" | "center" = "left") {
    const self = this;
    const renderer: IPrimitivePaneRenderer = {
      draw() {},
      drawBackground(target: Target) {
        self.paint(target);
      },
    };
    this.view = { zOrder: () => "bottom", renderer: () => renderer };
  }

  attached(param: SeriesAttachedParameter<Time>): void {
    this.series = param.series;
  }

  detached(): void {
    this.series = null;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.view];
  }

  private paint(target: Target): void {
    const series = this.series;
    if (!series) return;
    target.useMediaCoordinateSpace(({ context, mediaSize }) => {
      const yOf = (v: number, edge: number) => {
        if (!Number.isFinite(v)) return edge;
        const y = series.priceToCoordinate(v);
        return y === null ? edge : y;
      };
      for (const b of this.bands) {
        const yTop = Math.max(0, Math.min(mediaSize.height, yOf(b.to, 0)));
        const yBottom = Math.max(0, Math.min(mediaSize.height, yOf(b.from, mediaSize.height)));
        if (yBottom - yTop < 1) continue;
        context.fillStyle = b.color;
        context.fillRect(0, yTop, mediaSize.width, yBottom - yTop);
        if (b.label && yBottom - yTop > 16) {
          context.font = "600 11px system-ui, sans-serif";
          context.fillStyle = b.labelColor ?? "rgba(232,235,239,0.55)";
          context.textBaseline = "middle";
          if (this.labelAlign === "center") {
            context.textAlign = "center";
            context.fillText(b.label, mediaSize.width / 2, (yTop + yBottom) / 2);
          } else {
            context.textAlign = "left";
            context.fillText(b.label, 10, Math.min(yBottom - 10, yTop + 14));
          }
        }
      }
    });
  }
}

/** Show the last `days` days (or everything for null). */
export function showRange(chart: IChartApi, lastTime: number, days: number | null): void {
  if (days === null) {
    chart.timeScale().fitContent();
    return;
  }
  chart.timeScale().setVisibleRange({ from: (lastTime - days * 86400) as Time, to: (lastTime + 86400) as Time });
}

export const RANGES: { label: string; days: number | null }[] = [
  { label: "1M", days: 31 },
  { label: "3M", days: 92 },
  { label: "6M", days: 183 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];
