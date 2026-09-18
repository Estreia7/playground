"use client";

import { useEffect, useRef } from "react";
import { pair, DEFAULT_PAIR } from "../pairs.ts";
import { timeframe, type TimeframeId } from "../timeframes.ts";
import { Panel } from "../ui/parts.tsx";

/* TradingView's own chart, embedded.

   This is their free Advanced Chart widget: their data, their drawing tools,
   their indicator library. It is here because nothing we build will match it
   for reading a chart, and the setups tab already covers what we do better.

   What it cannot do is sign in. TradingView does not expose account access to
   embedded widgets at any tier, so saved layouts, alerts and drawings live on
   their site rather than here. The link below opens the same symbol in a
   logged-in tab, which is the honest workaround. */

export default function TradingViewTab({ tf }: { tf: TimeframeId }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const meta = pair(DEFAULT_PAIR);
  const interval = timeframe(tf).tvInterval;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The widget script reads its configuration from its own text content and
    // renders into the preceding div, so changing the interval means building
    // the whole embed again.
    container.innerHTML = "";

    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container__widget";
    holder.style.height = "100%";
    container.appendChild(holder);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: meta.tradingView,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      autosize: true,
      allow_symbol_change: false,
      calendar: false,
      hide_side_toolbar: false,
      withdateranges: true,
      // The same two indicators the scoring reasons about, so this chart and
      // the terminal are telling the same story.
      studies: ["STD;RSI", "STD;MACD"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      /* The embed script keeps poking at its own DOM after we are done with it,
         and a cleared container leaves it holding nodes that no longer exist —
         which throws on every teardown. Detaching the subtree in one move gives
         their code something intact to find while the page itself is clean. */
      const detached = document.createElement("div");
      while (container.firstChild) detached.appendChild(container.firstChild);
    };
  }, [interval, meta.tradingView]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Panel>
        <div
          ref={containerRef}
          className="tradingview-widget-container"
          style={{ height: "calc(100dvh - 190px)", minHeight: 420, width: "100%" }}
        />
      </Panel>

      <Panel title="About this tab">
        <div style={{ padding: "12px 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--fx-muted)" }}>
          <p style={{ margin: "0 0 8px" }}>
            This is TradingView&apos;s free embedded chart, showing their own {meta.label} data with
            RSI and MACD already applied. It follows the timeframe selected above.
          </p>
          <p style={{ margin: "0 0 10px" }}>
            Embedded charts cannot sign in to a TradingView account, so drawings, saved layouts and
            alerts stay on their site. Open the same chart there to use them.
          </p>
          <a
            className="btn"
            href={
              "https://www.tradingview.com/chart/?symbol=" +
              encodeURIComponent(meta.tradingView) +
              "&interval=" +
              encodeURIComponent(interval)
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            Open {meta.label} on TradingView ↗
          </a>
        </div>
      </Panel>
    </div>
  );
}
