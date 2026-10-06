"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useJson } from "./lib/useJson.ts";
import type { MarketRow, MarketsPayload, Zone } from "./lib/types.ts";
import { ZONE_COLOR, ZONE_LABEL, changeClass, compactUsd, pct, price } from "./lib/format.ts";
import { BmsCell, CoinIcon, ErrorNote, Gauge, SignalCell, Sparkline } from "./ui/bits.tsx";

type SortKey = "rank" | "price" | "marketCap" | "volume" | "change1h" | "change24h" | "change7d" | "micro" | "macro" | "bms";

const COLUMNS: { key: SortKey; label: string; title?: string }[] = [
  { key: "price", label: "Price" },
  { key: "marketCap", label: "MCap" },
  { key: "volume", label: "Volume" },
  { key: "change1h", label: "1h" },
  { key: "change24h", label: "24h" },
  { key: "change7d", label: "7d" },
  { key: "micro", label: "Micro signal", title: "RSI(14) on daily closes" },
  { key: "macro", label: "Macro signal", title: "RSI(14) on weekly closes" },
  { key: "bms", label: "BMS", title: "Bull Market Support Band: 20-week SMA and 21-week EMA" },
];

const ZONE_FILTERS: (Zone | "all")[] = ["all", "buy", "buy-warning", "neutral", "sell-warning", "sell"];

function sortValue(r: MarketRow, key: SortKey): number | null {
  if (key === "bms") return r.bms ? r.bms.distance : null;
  return r[key] as number | null;
}

export default function OverviewView() {
  const { data, error } = useJson<MarketsPayload>("/api/crypto/markets", 60_000);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [microFilter, setMicroFilter] = useState<Zone | "all">("all");
  const [macroFilter, setMacroFilter] = useState<Zone | "all">("all");
  const [perPage, setPerPage] = useState(25);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    const filtered = data.coins.filter(
      (c) =>
        (!q || c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)) &&
        (microFilter === "all" || c.microZone === microFilter) &&
        (macroFilter === "all" || c.macroZone === macroFilter)
    );
    return [...filtered].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      // Empty cells sink to the bottom whichever way the column is sorted.
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * sort.dir;
    });
  }, [data, search, microFilter, macroFilter, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages - 1);
  const visible = rows.slice(current * perPage, current * perPage + perPage);

  const toggleSort = (key: SortKey) => {
    setPage(0);
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === "rank" ? 1 : -1 }));
  };

  const open = (c: MarketRow) => router.push(`/crypto/chart?s=${encodeURIComponent(c.symbol)}`);

  return (
    <main className="cx-main">
      <div className="cx-page-head">
        <div>
          <h1>Market overview</h1>
          <p>
            The top 100 coins by market cap, with stablecoins and wrapped tokens left out. Signals come from each coin&apos;s
            Binance candles and refresh every 15 minutes; prices every minute or so.
          </p>
        </div>
        {data && (
          <span className="faint" style={{ fontSize: 12 }}>
            Updated {new Date(data.updatedAt * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {error && !data && <ErrorNote message={error} />}
      {!data && !error && <Loading />}

      {data && (
        <>
          <MarketStrip data={data} />
          <Sentiment data={data} />

          <section className="cx-panel" aria-label="Coins" style={{ marginTop: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, padding: "14px 16px" }}>
              <IconStrip coins={data.coins} />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginLeft: "auto" }}>
                <label className="sr-only" htmlFor="micro-filter">Filter micro signals</label>
                <select
                  id="micro-filter"
                  className="cx-select"
                  value={microFilter}
                  onChange={(e) => {
                    setMicroFilter(e.target.value as Zone | "all");
                    setPage(0);
                  }}
                >
                  {ZONE_FILTERS.map((z) => (
                    <option key={z} value={z}>
                      {z === "all" ? "All micro signals" : "Micro: " + ZONE_LABEL[z]}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="macro-filter">Filter macro signals</label>
                <select
                  id="macro-filter"
                  className="cx-select"
                  value={macroFilter}
                  onChange={(e) => {
                    setMacroFilter(e.target.value as Zone | "all");
                    setPage(0);
                  }}
                >
                  {ZONE_FILTERS.map((z) => (
                    <option key={z} value={z}>
                      {z === "all" ? "All macro signals" : "Macro: " + ZONE_LABEL[z]}
                    </option>
                  ))}
                </select>
                <input
                  className="cx-input"
                  type="search"
                  placeholder="Search coin"
                  aria-label="Search coins"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  style={{ width: 160 }}
                />
              </div>
            </div>

            <div className="cx-table-wrap">
              <table className="cx-table">
                <thead>
                  <tr>
                    <th className="left sticky-col" aria-sort={ariaSort(sort, "rank")}>
                      <button type="button" onClick={() => toggleSort("rank")}>
                        Coin{arrow(sort, "rank")}
                      </button>
                    </th>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={c.key === "micro" || c.key === "macro" || c.key === "bms" ? "left" : undefined}
                        aria-sort={ariaSort(sort, c.key)}
                        title={c.title}
                      >
                        <button type="button" onClick={() => toggleSort(c.key)}>
                          {c.label}
                          {arrow(sort, c.key)}
                        </button>
                      </th>
                    ))}
                    <th>Last day</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => open(c)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") open(c);
                      }}
                      tabIndex={0}
                      aria-label={`${c.name}: open chart`}
                    >
                      <td className="left sticky-col">
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span className="cx-rank mono">#{c.rank ?? "—"}</span>
                          <CoinIcon src={c.image} symbol={c.symbol} />
                          <span style={{ display: "grid", lineHeight: 1.25 }}>
                            <b style={{ fontWeight: 600 }}>{c.symbol}</b>
                            <span className="faint" style={{ fontSize: 11.5, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>
                              {c.name}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="mono">{price(c.price)}</td>
                      <td className="mono muted">{compactUsd(c.marketCap)}</td>
                      <td className="mono muted">{compactUsd(c.volume)}</td>
                      <td className={"mono " + changeClass(c.change1h)}>{pct(c.change1h)}</td>
                      <td className={"mono " + changeClass(c.change24h)}>{pct(c.change24h)}</td>
                      <td className={"mono " + changeClass(c.change7d)}>{pct(c.change7d)}</td>
                      <td className="left">
                        <SignalCell value={c.micro} zone={c.microZone} />
                      </td>
                      <td className="left">
                        <SignalCell value={c.macro} zone={c.macroZone} />
                      </td>
                      <td className="left">
                        <BmsCell bms={c.bms} />
                      </td>
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                          <Sparkline values={c.spark} />
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!visible.length && (
                    <tr>
                      <td colSpan={COLUMNS.length + 2} className="left muted" style={{ padding: 24, cursor: "default" }}>
                        No coins match those filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, padding: "12px 16px", fontSize: 12.5 }}>
              <label className="muted" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <select
                  className="cx-select"
                  value={perPage}
                  onChange={(e) => {
                    setPerPage(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {[25, 50, 100].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                per page
              </label>
              <span className="faint">
                {rows.length ? `${current * perPage + 1}–${Math.min(rows.length, (current + 1) * perPage)} of ${rows.length}` : "0 coins"}
              </span>
              <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                <button type="button" className="cx-btn" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  Previous
                </button>
                <button type="button" className="cx-btn" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
                  Next
                </button>
              </div>
            </div>
          </section>

          <HowToRead />
        </>
      )}
    </main>
  );
}

function arrow(sort: { key: SortKey; dir: 1 | -1 }, key: SortKey): string {
  return sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : "";
}

function ariaSort(sort: { key: SortKey; dir: 1 | -1 }, key: SortKey): "ascending" | "descending" | undefined {
  return sort.key === key ? (sort.dir === 1 ? "ascending" : "descending") : undefined;
}

function MarketStrip({ data }: { data: MarketsPayload }) {
  const g = data.global;
  const items: { label: string; value: string; cls?: string; href?: string }[] = [
    { label: "Total market cap", value: compactUsd(g?.marketCap) },
    { label: "24h", value: pct(g?.change24h), cls: changeClass(g?.change24h) },
    { label: "24h volume", value: compactUsd(g?.volume) },
    { label: "BTC dominance", value: g?.btcDominance != null ? g.btcDominance.toFixed(1) + "%" : "—" },
    { label: "ETH dominance", value: g?.ethDominance != null ? g.ethDominance.toFixed(1) + "%" : "—" },
    { label: "USDT dominance", value: g?.usdtDominance != null ? g.usdtDominance.toFixed(2) + "%" : "—" },
  ];
  return (
    <div
      className="cx-panel"
      style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", padding: "12px 16px", marginBottom: 14, alignItems: "center" }}
    >
      {items.map((i) => (
        <div key={i.label} style={{ display: "grid", gap: 2 }}>
          <span className="faint" style={{ fontSize: 11 }}>
            {i.label}
          </span>
          <span className={"mono " + (i.cls ?? "")} style={{ fontSize: 14, fontWeight: 500 }}>
            {i.value}
          </span>
        </div>
      ))}
      {data.fearGreed && (
        <div style={{ display: "grid", gap: 2, marginLeft: "auto" }} title="Fear & Greed Index by alternative.me">
          <span className="faint" style={{ fontSize: 11 }}>
            Fear &amp; Greed
          </span>
          <span style={{ fontSize: 14, fontWeight: 500 }}>
            <span className="mono">{data.fearGreed.value}</span>{" "}
            <span className="muted" style={{ fontSize: 12.5 }}>
              {data.fearGreed.label}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function Sentiment({ data }: { data: MarketsPayload }) {
  const all = [...data.micro.zones, ...data.micro.yesterday].map((z) => z.share);
  const scale = Math.max(0.05, ...all);
  return (
    <section
      className="cx-panel"
      aria-label="Market sentiment"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 0,
        padding: "8px 0",
      }}
    >
      <GaugeBlock title="Micro greed level" value={data.micro.level} note="Average daily RSI" />
      <ZoneBlock title="Micro market zones" zones={data.micro.zones} scale={scale} note={`${data.micro.counted} coins with signals`} />
      <ZoneBlock title="Micro zones yesterday" zones={data.micro.yesterday} scale={scale} note="As of yesterday's close" />
      <GaugeBlock title="Macro greed level" value={data.macro.level} note="Average weekly RSI" />
    </section>
  );
}

function GaugeBlock({ title, value, note }: { title: string; value: number | null; note: string }) {
  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "14px 16px" }}>
      <h2 className="cx-eyebrow" style={{ color: "#6fdcc8" }}>
        {title}
      </h2>
      <Gauge value={value} label={title} />
      <span className="faint" style={{ fontSize: 11.5 }}>
        {note}
      </span>
    </div>
  );
}

function ZoneBlock({
  title,
  zones,
  scale,
  note,
}: {
  title: string;
  zones: { zone: Zone; share: number }[];
  scale: number;
  note: string;
}) {
  return (
    <div style={{ padding: "14px 18px", borderLeft: "1px solid var(--cx-rule-soft)" }}>
      <h2 className="cx-eyebrow" style={{ textAlign: "center", marginBottom: 10 }}>
        {title}
      </h2>
      <div style={{ display: "grid", gap: 9 }}>
        {zones.map((z) => (
          <div key={z.zone} style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span style={{ color: ZONE_COLOR[z.zone] }}>{ZONE_LABEL[z.zone]}</span>
              <span className="mono muted">{(z.share * 100).toFixed(1)}%</span>
            </div>
            <span style={{ height: 3, borderRadius: 2, background: "var(--cx-raised)", overflow: "hidden" }}>
              <span
                style={{
                  display: "block",
                  height: "100%",
                  width: `${Math.max(z.share > 0 ? 3 : 0, (z.share / scale) * 100)}%`,
                  background: ZONE_COLOR[z.zone],
                  borderRadius: 2,
                }}
              />
            </span>
          </div>
        ))}
      </div>
      <p className="faint" style={{ margin: "10px 0 0", fontSize: 11.5, textAlign: "center" }}>
        {note}
      </p>
    </div>
  );
}

function IconStrip({ coins }: { coins: MarketRow[] }) {
  const shown = coins.slice(0, 18);
  return (
    <div className="cx-icons" aria-label="Top coins">
      {shown.map((c, i) => (
        <Link
          key={c.id}
          href={`/crypto/chart?s=${encodeURIComponent(c.symbol)}`}
          title={c.name}
          style={{ marginLeft: i ? -6 : 0, borderRadius: "50%", boxShadow: "0 0 0 2px var(--cx-panel)", display: "flex" }}
        >
          <CoinIcon src={c.image} symbol={c.symbol} size={26} />
        </Link>
      ))}
      {coins.length > shown.length && (
        <span
          className="mono"
          style={{
            marginLeft: 6,
            padding: "3px 8px",
            borderRadius: 999,
            background: "var(--cx-raised)",
            color: "var(--cx-muted)",
            fontSize: 11.5,
          }}
        >
          +{coins.length - shown.length}
        </span>
      )}
    </div>
  );
}

function HowToRead() {
  return (
    <section className="cx-panel cx-note" style={{ marginTop: 14, padding: "14px 18px" }}>
      <h2 className="cx-eyebrow" style={{ marginBottom: 8 }}>
        How the signals are made
      </h2>
      <p style={{ margin: "0 0 6px" }}>
        <b>Micro signal</b> is RSI(14) on daily closes; <b>macro signal</b> is the same on weekly closes. Zones: 30 or
        below is <span style={{ color: "var(--z-buy)" }}>Buy</span>, up to 40{" "}
        <span style={{ color: "var(--z-buy-warning)" }}>Buy Warning</span>, 60 to 70{" "}
        <span style={{ color: "var(--z-sell-warning)" }}>Sell Warning</span> and 70 or above{" "}
        <span style={{ color: "var(--z-sell)" }}>Sell</span>. The greed levels are the average of those readings across
        the table.
      </p>
      <p style={{ margin: 0 }}>
        <b>BMS</b> is the Bull Market Support Band, between the 20-week SMA and 21-week EMA. Above it is a bull trend
        (the band is support, shown with ↓); below it a bear trend (the band is resistance, ↑); more than 25% away
        counts as strong. None of this is financial advice.
      </p>
    </section>
  );
}

function Loading() {
  return (
    <div style={{ display: "grid", gap: 14 }} aria-busy="true" aria-label="Loading market data">
      <div className="cx-skeleton" style={{ height: 58 }} />
      <div className="cx-skeleton" style={{ height: 210 }} />
      <div className="cx-skeleton" style={{ height: 420 }} />
    </div>
  );
}
