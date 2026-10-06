"use client";

import { useEffect, useRef } from "react";

/* TradingView's free Advanced Chart widget: their data feed, their drawing
   tools (trend lines, Fibonacci, brushes) and their indicator library.

   Embedded charts cannot sign in to a TradingView account at any tier, so
   drawings and VIP/community indicators do not persist here; the link under
   the chart opens the same symbol on tradingview.com for that. */

export function TradingViewChart({ symbol, interval = "D" }: { symbol: string; interval?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    // The embed reads its settings from the script's own text, so a new
    // symbol means a fresh embed.
    container.innerHTML = "";
    const holder = document.createElement("div");
    holder.className = "tradingview-widget-container__widget";
    holder.style.height = "100%";
    holder.style.width = "100%";
    container.appendChild(holder);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      interval,
      timezone: "Etc/UTC",
      theme: "dark",
      style: "1",
      locale: "en",
      autosize: true,
      backgroundColor: "#0a0c0f",
      gridColor: "rgba(35, 40, 48, 0.6)",
      allow_symbol_change: true,
      hide_side_toolbar: false,
      withdateranges: true,
      save_image: true,
      calendar: false,
      studies: ["STD;RSI"],
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      // Their script keeps touching its nodes after unmount; moving the
      // subtree out in one go leaves it something intact to find.
      const detached = document.createElement("div");
      while (container.firstChild) detached.appendChild(container.firstChild);
    };
  }, [symbol, interval]);

  return <div ref={ref} className="tradingview-widget-container" style={{ height: "100%", width: "100%" }} />;
}
