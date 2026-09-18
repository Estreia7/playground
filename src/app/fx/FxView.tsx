"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Analog, Setup } from "./types.ts";
import { DEFAULT_PAIR, pair } from "./pairs.ts";
import { TIMEFRAMES, DEFAULT_TIMEFRAME, type TimeframeId } from "./timeframes.ts";
import { price, pips, ago } from "./format.ts";
import { useFxState, useSession } from "./useFxState.ts";
import { SetupList } from "./terminal/SetupList.tsx";
import AnalogSheet from "./terminal/AnalogSheet.tsx";
import { Panel, Notice } from "./ui/parts.tsx";
import TradingViewTab from "./tradingview/TradingViewTab.tsx";
import AlertsView from "./alerts/AlertsView.tsx";
import PaperView from "./paper/PaperView.tsx";
import AnalyticsView from "./analytics/AnalyticsView.tsx";
import SettingsView from "./settings/SettingsView.tsx";

/* The shell.

   Six tabs on a rail, one shared state hook. The terminal is the default
   because it is the thing you open the tool to look at; everything else
   answers a question the terminal raises.

   The chart is loaded without server rendering: Lightweight Charts is
   canvas-only and touches document on construction. */

const PriceChart = dynamic(() => import("./terminal/PriceChart.tsx"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 520, display: "grid", placeItems: "center", color: "var(--fx-faint)" }}>
      Loading chart…
    </div>
  ),
});

/* The chart takes the height the window can spare rather than a fixed 520.

   On a tall monitor a fixed height wastes half the screen; on a laptop it
   pushes the oscillator panes off the fold. Clamped at both ends so the three
   panes stay legible whatever the window is doing. */
function useChartHeight(): number {
  const [height, setHeight] = useState(520);

  useEffect(() => {
    const measure = () => {
      const available = window.innerHeight - 150;
      const narrow = window.innerWidth <= 1100;
      setHeight(Math.max(340, Math.min(narrow ? 460 : 760, available)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return height;
}

type Tab = "terminal" | "tradingview" | "alerts" | "paper" | "analytics" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "terminal", label: "Terminal", icon: "▤" },
  { id: "tradingview", label: "TradingView", icon: "◫" },
  { id: "alerts", label: "Alerts", icon: "◉" },
  { id: "paper", label: "Paper", icon: "▦" },
  { id: "analytics", label: "Analytics", icon: "◔" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function FxView() {
  const [tab, setTab] = useState<Tab>("terminal");
  const [tf, setTf] = useState<TimeframeId>(DEFAULT_TIMEFRAME);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Setup | null>(null);
  const [hoveredAnalog, setHoveredAnalog] = useState<Analog | null>(null);
  const [prefill, setPrefill] = useState<Setup | null>(null);

  const chartHeight = useChartHeight();
  const { state, candles, error, loading, refresh } = useFxState(DEFAULT_PAIR, tf);
  const session = useSession();

  // The list carries light setups; the full analog set is fetched on demand,
  // because fifty analogs with their shapes is far too much to poll.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setHoveredAnalog(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/fx/setups/" + selectedId, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) setDetail(body.setup as Setup);
      } catch {
        // The setup expired between the click and the fetch; the panel just
        // stays on the summary.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // Number keys switch timeframe, which is the one shortcut a chart tool
  // really needs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const index = Number(event.key);
      if (Number.isInteger(index) && index >= 1 && index <= TIMEFRAMES.length) {
        setTf(TIMEFRAMES[index - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tradeSetup = useCallback((setup: Setup) => {
    setPrefill(setup);
    setTab("paper");
  }, []);

  return (
    <div style={{ display: "flex", minHeight: "100dvh" }}>
      <Rail tab={tab} onTab={setTab} unseen={state?.alerts.unseen ?? 0} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <TopBar
          tf={tf}
          onTf={setTf}
          state={state}
          showTimeframes={tab === "terminal" || tab === "tradingview"}
        />

        <main className="fx-main" style={{ flex: 1, padding: 14 }}>
          {error && (
            <div
              className="panel"
              style={{ marginBottom: 12, borderColor: "var(--fx-short-dim)" }}
              role="alert"
            >
              <Notice title="Could not reach the server" tone="error">
                {error} The page will keep trying.
              </Notice>
            </div>
          )}

          {tab === "terminal" && (
            <TerminalTab
              chartHeight={chartHeight}
              candles={candles}
              state={state}
              loading={loading}
              detail={detail}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onTrade={tradeSetup}
              hoveredAnalog={hoveredAnalog}
              onHoverAnalog={setHoveredAnalog}
            />
          )}

          {tab === "tradingview" && <TradingViewTab tf={tf} />}

          {tab === "alerts" && (
            <AlertsView
              onOpenSetup={(id, alertTf) => {
                setTf(alertTf);
                setSelectedId(id);
                setTab("terminal");
              }}
            />
          )}

          {tab === "paper" && (
            <PaperView
              prefill={prefill}
              onPrefillUsed={() => setPrefill(null)}
              signedIn={session.signedIn === true}
              price={state?.price ?? null}
              tf={tf}
              onChanged={refresh}
            />
          )}

          {tab === "analytics" && <AnalyticsView />}

          {tab === "settings" && <SettingsView session={session} state={state} onChanged={refresh} />}
        </main>
      </div>
    </div>
  );
}

function Rail({
  tab,
  onTab,
  unseen,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  unseen: number;
}) {
  return (
    <nav
      aria-label="Sections"
      className="fx-rail"
      style={{
        width: 72,
        flexShrink: 0,
        borderRight: "1px solid var(--fx-rule)",
        background: "var(--fx-panel)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 12,
        gap: 2,
        position: "sticky",
        top: 0,
        height: "100dvh",
      }}
    >
      <Link
        href="/"
        title="Back to the playground"
        style={{
          fontSize: 16,
          color: "var(--fx-tape)",
          textDecoration: "none",
          marginBottom: 10,
          fontWeight: 700,
        }}
        className="display"
      >
        FX
      </Link>

      {TABS.map((item) => {
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            aria-current={active ? "page" : undefined}
            style={{
              width: 60,
              minHeight: 52,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              padding: "6px 2px",
              border: "none",
              borderRadius: 8,
              background: active ? "var(--fx-raised)" : "transparent",
              color: active ? "var(--fx-tape)" : "var(--fx-muted)",
              cursor: "pointer",
              position: "relative",
              fontSize: 10,
              fontWeight: 500,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 15 }}>
              {item.icon}
            </span>
            <span className="fx-rail-label">{item.label}</span>
            {item.id === "alerts" && unseen > 0 && (
              <span
                aria-label={unseen + " unseen alerts"}
                style={{
                  position: "absolute",
                  top: 4,
                  right: 8,
                  minWidth: 15,
                  height: 15,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: "var(--fx-tape)",
                  color: "#1a1408",
                  fontSize: 9.5,
                  fontWeight: 700,
                  display: "grid",
                  placeItems: "center",
                }}
                className="mono"
              >
                {unseen > 99 ? "99+" : unseen}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function TopBar({
  tf,
  onTf,
  state,
  showTimeframes,
}: {
  tf: TimeframeId;
  onTf: (tf: TimeframeId) => void;
  state: ReturnType<typeof useFxState>["state"];
  showTimeframes: boolean;
}) {
  // Freshness: green while the feed is keeping up, amber when it has fallen
  // behind, grey at the weekend when there is nothing to keep up with.
  const marketOpen = state?.scheduler.marketOpen ?? false;
  const ageSeconds = state?.lastBar ? Math.floor(Date.now() / 1000) - state.lastBar : null;
  const dotClass = !marketOpen ? "closed" : ageSeconds !== null && ageSeconds > 900 ? "stale" : "";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
        borderBottom: "1px solid var(--fx-rule)",
        background: "var(--fx-panel)",
        flexWrap: "wrap",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span className="display" style={{ fontSize: 15, fontWeight: 600 }}>
          {pair(DEFAULT_PAIR).label}
        </span>
        <span className="mono display" style={{ fontSize: 21, fontWeight: 600 }}>
          {price(state?.price ?? null)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
        <span className={"live-dot " + dotClass} aria-hidden="true" />
        <span className="muted">
          {!marketOpen
            ? "Market closed"
            : state?.lastBar
              ? "Updated " + ago(state.lastBar)
              : "No data yet"}
        </span>
      </div>

      {showTimeframes && (
        <div
          role="group"
          aria-label="Timeframe"
          style={{
            display: "flex",
            gap: 2,
            padding: 2,
            background: "var(--fx-ink)",
            border: "1px solid var(--fx-rule)",
            borderRadius: 7,
            marginLeft: "auto",
          }}
        >
          {TIMEFRAMES.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onTf(item.id)}
              aria-pressed={tf === item.id}
              title={"Press " + (i + 1)}
              style={{
                minWidth: 38,
                minHeight: 28,
                border: "none",
                borderRadius: 5,
                background: tf === item.id ? "var(--fx-tape)" : "transparent",
                color: tf === item.id ? "#1a1408" : "var(--fx-muted)",
                fontWeight: tf === item.id ? 600 : 500,
                fontSize: 12,
                cursor: "pointer",
              }}
              className="mono"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {state && (
        <div
          style={{ display: "flex", gap: 14, fontSize: 11.5, marginLeft: showTimeframes ? 0 : "auto" }}
        >
          <span className="muted">
            Equity{" "}
            <strong
              className="mono"
              style={{
                color: state.account.openPnl >= 0 ? "var(--fx-text)" : "var(--fx-short)",
              }}
            >
              ${state.account.equity.toFixed(0)}
            </strong>
          </span>
          {state.account.openPositions > 0 && (
            <span className="muted">
              {state.account.openPositions} open{" "}
              <strong
                className="mono"
                style={{
                  color: state.account.openPnl >= 0 ? "var(--fx-long)" : "var(--fx-short)",
                }}
              >
                {pips(state.account.openPnl / 10)}
              </strong>
            </span>
          )}
        </div>
      )}
    </header>
  );
}

function TerminalTab({
  chartHeight,
  candles,
  state,
  loading,
  detail,
  selectedId,
  onSelect,
  onTrade,
  hoveredAnalog,
  onHoverAnalog,
}: {
  chartHeight: number;
  candles: ReturnType<typeof useFxState>["candles"];
  state: ReturnType<typeof useFxState>["state"];
  loading: boolean;
  detail: Setup | null;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTrade: (setup: Setup) => void;
  hoveredAnalog: Analog | null;
  onHoverAnalog: (analog: Analog | null) => void;
}) {
  const setups = state?.setups ?? [];

  if (!loading && candles.length === 0) {
    return (
      <Panel>
        <Notice title="No candles stored for this timeframe">
          Open Settings and run a backfill to download history from Dukascopy. The 1h and 15m
          timeframes are a good place to start: they carry enough bars for the analog search
          without taking long to fetch.
        </Notice>
      </Panel>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 380px)",
        gap: 12,
        alignItems: "start",
      }}
      className="fx-terminal-grid"
    >
      <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
        <Panel>
          <PriceChart
            height={chartHeight}
            candles={candles}
            setups={setups}
            positions={[]}
            hoveredAnalog={hoveredAnalog}
            selectedSetupId={selectedId}
            onSelectSetup={onSelect}
          />
        </Panel>

        {detail && (
          <Panel title={"What happened last time · " + detail.stats?.count + " matches"}>
            <AnalogSheet
              analogs={detail.analogs}
              stats={detail.stats}
              direction={detail.direction}
              onHover={onHoverAnalog}
              hovered={hoveredAnalog}
            />
          </Panel>
        )}
      </div>

      <Panel
        title={"Candidates on this timeframe"}
        action={<span className="chip mono">{setups.length}</span>}
      >
        <div
          className="thin-scroll fx-candidates"
          style={{ maxHeight: chartHeight + 60, overflowY: "auto" }}
        >
          <SetupList
            setups={setups}
            selectedId={selectedId}
            onSelect={onSelect}
            onTrade={onTrade}
          />
        </div>
      </Panel>
    </div>
  );
}
