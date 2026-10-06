"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useJson } from "../lib/useJson.ts";
import type { MarketRow, MarketsPayload } from "../lib/types.ts";
import { changeClass, compactUsd, pct, price } from "../lib/format.ts";
import { CoinIcon } from "../ui/bits.tsx";
import { TradingViewChart } from "./TradingViewChart.tsx";

/* The chart page: TradingView in the middle, the market down the side.

   The list is the same top-100 the overview uses. Stars build a watchlist
   kept in this browser only — it is a personal shortcut, not shared state.
   Three market-wide charts sit above the coins: USDT dominance (money
   parked in stablecoins, which rises as the market falls), BTC dominance
   and total market cap. */

const INDICES = [
  { key: "USDT.D", label: "USDT Dominance", tv: "CRYPTOCAP:USDT.D", short: "USDT.D" },
  { key: "BTC.D", label: "BTC Dominance", tv: "CRYPTOCAP:BTC.D", short: "BTC.D" },
  { key: "TOTAL", label: "Total Market Cap", tv: "CRYPTOCAP:TOTAL", short: "TOTAL" },
];

type Sort = "rank" | "up" | "down";
const WATCH_KEY = "crypto-desk:watchlist";

function readWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCH_KEY);
    return raw ? (JSON.parse(raw) as string[]) : ["BTC", "ETH", "XRP", "SOL"];
  } catch {
    return ["BTC", "ETH", "XRP", "SOL"];
  }
}

export default function ChartView() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = (params.get("s") ?? "BTC").toUpperCase();
  const { data, error } = useJson<MarketsPayload>("/api/crypto/markets", 30_000);

  const [tab, setTab] = useState<"markets" | "watchlist">("markets");
  const [sort, setSort] = useState<Sort>("rank");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<string[]>([]);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => setWatch(readWatchlist()), []);

  const toggleWatch = (sym: string) => {
    setWatch((w) => {
      const next = w.includes(sym) ? w.filter((s) => s !== sym) : [...w, sym];
      try {
        localStorage.setItem(WATCH_KEY, JSON.stringify(next));
      } catch {
        // private window: the star still works for this visit
      }
      return next;
    });
  };

  const index = INDICES.find((i) => i.key === selected);
  const coin = data?.coins.find((c) => c.symbol === selected);
  const tvSymbol = index?.tv ?? coin?.tradingView ?? `BINANCE:${selected}USDT`;

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    let rows = data.coins.filter((c) => !q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
    if (tab === "watchlist") rows = rows.filter((c) => watch.includes(c.symbol));
    const ch = (c: MarketRow) => c.change24h ?? 0;
    if (sort === "up") rows = [...rows].sort((a, b) => ch(b) - ch(a));
    if (sort === "down") rows = [...rows].sort((a, b) => ch(a) - ch(b));
    return rows;
  }, [data, query, tab, watch, sort]);

  const select = (sym: string) => {
    router.replace(`/crypto/chart?s=${encodeURIComponent(sym)}`, { scroll: false });
    setListOpen(false);
  };

  const g = data?.global;
  const indexValue = (key: string) =>
    key === "USDT.D" ? (g?.usdtDominance != null ? g.usdtDominance.toFixed(2) + "%" : "—")
    : key === "BTC.D" ? (g?.btcDominance != null ? g.btcDominance.toFixed(1) + "%" : "—")
    : compactUsd(g?.marketCap);

  return (
    <div className="cx-chart-layout">
      <aside className={"cx-side" + (listOpen ? " open" : "")} aria-label="Markets">
        <div style={{ display: "grid", gap: 10, padding: 12 }}>
          <div className="cx-seg" role="group" aria-label="List" style={{ width: "100%" }}>
            <button type="button" aria-pressed={tab === "markets"} onClick={() => setTab("markets")} style={{ flex: 1 }}>
              Markets
            </button>
            <button type="button" aria-pressed={tab === "watchlist"} onClick={() => setTab("watchlist")} style={{ flex: 1 }}>
              ★ Watchlist
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <span className="faint" style={{ fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              Sort
            </span>
            {(["rank", "up", "down"] as Sort[]).map((s) => (
              <button
                key={s}
                type="button"
                className="cx-sort"
                aria-pressed={sort === s}
                onClick={() => setSort(s)}
              >
                <i style={{ background: s === "rank" ? "var(--cx-accent)" : s === "up" ? "var(--cx-up)" : "var(--cx-down)" }} />
                {s === "rank" ? "Rank" : s === "up" ? "Up" : "Down"}
              </button>
            ))}
          </div>
          <input
            className="cx-input"
            type="search"
            placeholder="Search BTC, ETH…"
            aria-label="Search coins"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ul className="cx-list" aria-label="Coins">
          {tab === "markets" && !query &&
            INDICES.map((i) => (
              <li key={i.key}>
                <button type="button" className="cx-row" aria-current={selected === i.key ? "true" : undefined} onClick={() => select(i.key)}>
                  <span className="cx-index-mark mono">{i.short.replace(".D", "")}</span>
                  <span className="name">
                    <b>{i.short}</b>
                    <small>{i.label}</small>
                  </span>
                  <span className="nums">
                    <b className="mono">{indexValue(i.key)}</b>
                  </span>
                </button>
              </li>
            ))}
          {list.map((c) => (
            <li key={c.id}>
              <div className="cx-row-wrap">
                <button
                  type="button"
                  className="cx-star"
                  aria-label={watch.includes(c.symbol) ? `Remove ${c.symbol} from watchlist` : `Add ${c.symbol} to watchlist`}
                  aria-pressed={watch.includes(c.symbol)}
                  onClick={() => toggleWatch(c.symbol)}
                >
                  {watch.includes(c.symbol) ? "★" : "☆"}
                </button>
                <button type="button" className="cx-row" aria-current={selected === c.symbol ? "true" : undefined} onClick={() => select(c.symbol)}>
                  <CoinIcon src={c.image} symbol={c.symbol} size={24} />
                  <span className="name">
                    <b>
                      {c.symbol} <small style={{ display: "inline" }}>{c.name}</small>
                    </b>
                    <small>MC {compactUsd(c.marketCap)}</small>
                  </span>
                  <span className="nums">
                    <b className="mono">{price(c.price)}</b>
                    <small className={"mono " + changeClass(c.change24h)}>{pct(c.change24h, 2)}</small>
                  </span>
                </button>
              </div>
            </li>
          ))}
          {data && !list.length && (
            <li className="muted" style={{ padding: 16, fontSize: 13 }}>
              {tab === "watchlist" ? "No coins starred yet. Tap ☆ next to a coin to add it." : "No coin matches that search."}
            </li>
          )}
          {!data && !error &&
            Array.from({ length: 10 }, (_, i) => (
              <li key={i} style={{ padding: "6px 12px" }}>
                <div className="cx-skeleton" style={{ height: 40 }} />
              </li>
            ))}
          {error && !data && (
            <li style={{ padding: 16, fontSize: 13, color: "#ff9aa2" }}>{error}</li>
          )}
        </ul>
      </aside>

      <section className="cx-chart-main" aria-label={`${selected} chart`}>
        <div className="cx-chart-bar">
          <button type="button" className="cx-btn cx-list-toggle" onClick={() => setListOpen((o) => !o)} aria-expanded={listOpen}>
            ☰ Coins
          </button>
          {coin && <CoinIcon src={coin.image} symbol={coin.symbol} size={22} />}
          <b style={{ fontSize: 15 }}>{index?.label ?? coin?.name ?? selected}</b>
          {coin && (
            <>
              <span className="mono" style={{ fontSize: 15 }}>
                {price(coin.price)}
              </span>
              <span className={"mono " + changeClass(coin.change24h)} style={{ fontSize: 13 }}>
                {pct(coin.change24h, 2)}
              </span>
            </>
          )}
          <a
            className="cx-btn"
            style={{ marginLeft: "auto" }}
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open on TradingView ↗
          </a>
        </div>
        <div className="cx-chart-frame">
          <TradingViewChart symbol={tvSymbol} />
        </div>
      </section>
    </div>
  );
}
