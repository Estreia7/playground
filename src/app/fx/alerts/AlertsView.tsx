"use client";

import { useCallback, useEffect, useState } from "react";
import type { Alert } from "../types.ts";
import { timeframe, type TimeframeId } from "../timeframes.ts";
import { price, barTime, ago } from "../format.ts";
import { Panel, ScoreBadge, DirectionTag, Notice } from "../ui/parts.tsx";

/* Alerts: setups that crossed the threshold while nobody was looking.

   The scanner runs on the server every five minutes whether or not this page
   is open, so this list is the record of what it found. Nothing is pushed
   anywhere — no email, no phone — by choice: a notification you cannot act on
   is an interruption, and this is a tool you come to rather than one that
   comes to you.

   Rows are marked seen when the tab is opened, which is the only honest
   moment to call them seen. */

export default function AlertsView({
  onOpenSetup,
}: {
  onOpenSetup: (setupId: string, tf: TimeframeId) => void;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "long" | "short">("all");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/fx/alerts", { cache: "no-store" });
      const body = await response.json();
      setAlerts((body.alerts ?? []) as Alert[]);
    } catch {
      // The shell already shows a connection error; nothing to add here.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Mark everything seen once, shortly after the list is shown. The delay is
  // long enough that the unseen highlight is actually visible first.
  useEffect(() => {
    const unseen = alerts.filter((a) => !a.seen).map((a) => a.id);
    if (unseen.length === 0) return;

    const timer = setTimeout(() => {
      void fetch("/api/fx/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: unseen }),
      }).then(() => load());
    }, 1600);

    return () => clearTimeout(timer);
  }, [alerts, load]);

  const shown = alerts.filter((a) => filter === "all" || a.direction === filter);

  return (
    <Panel
      title="Alerts"
      action={
        <div style={{ display: "flex", gap: 2 }}>
          {(["all", "long", "short"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              aria-pressed={filter === option}
              className="btn"
              style={{
                minHeight: 26,
                padding: "0 9px",
                fontSize: 11.5,
                background: filter === option ? "var(--fx-raised)" : "transparent",
                borderColor: filter === option ? "var(--fx-tape-dim)" : "var(--fx-rule)",
                color: filter === option ? "var(--fx-tape)" : "var(--fx-muted)",
                textTransform: "capitalize",
              }}
            >
              {option}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <Notice title="Loading alerts…" />
      ) : shown.length === 0 ? (
        <Notice title={alerts.length === 0 ? "Nothing has triggered yet" : "Nothing matches that filter"}>
          {alerts.length === 0 ? (
            <>
              The scanner raises an alert when a setup scores at or above the alert threshold, which
              you can change in Settings. If the scheduler is off, or the market is closed, nothing
              will appear here.
            </>
          ) : (
            <>Try a different direction filter.</>
          )}
        </Notice>
      ) : (
        <div className="thin-scroll" style={{ maxHeight: "calc(100dvh - 190px)", overflowY: "auto" }}>
          {shown.map((alert) => (
            <article
              key={alert.id}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                padding: "11px 14px",
                borderBottom: "1px solid var(--fx-rule)",
                // Unseen rows carry a quiet amber edge rather than a filled
                // background: a list of highlighted rows is just a loud list.
                borderLeft: alert.seen ? "2px solid transparent" : "2px solid var(--fx-tape)",
              }}
            >
              <ScoreBadge score={alert.score} size={38} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <DirectionTag direction={alert.direction} />
                  <span className="chip">{timeframe(alert.tf).label}</span>
                  {!alert.seen && <span className="chip chip-tape">New</span>}
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--fx-text)" }}>
                  {alert.headline}
                </p>
                <div
                  className="mono"
                  style={{ marginTop: 4, fontSize: 11, color: "var(--fx-faint)", display: "flex", gap: 10 }}
                >
                  <span>{price(alert.price)}</span>
                  <span>{barTime(alert.barTime)}</span>
                  <span>{ago(Math.floor(new Date(alert.createdAt).getTime() / 1000))}</span>
                </div>
              </div>

              <button
                type="button"
                className="btn"
                onClick={() => onOpenSetup(alert.setupId, alert.tf)}
              >
                Open
              </button>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}
