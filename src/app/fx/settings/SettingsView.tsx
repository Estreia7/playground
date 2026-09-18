"use client";

import { useCallback, useEffect, useState } from "react";
import type { FxSettings } from "../../api/fx/settings.ts";
import type { FxState } from "../useFxState.ts";
import type { useSession } from "../useFxState.ts";
import { TIMEFRAMES, timeframe, type TimeframeId } from "../timeframes.ts";
import { ago, compact, dateOnly } from "../format.ts";
import { Panel, Field, Notice, Stat } from "../ui/parts.tsx";

/* Settings: the knobs, and the state of the data behind them.

   Two halves. The Data section is the one that matters day to day — it says
   how much history each timeframe has, when it was last updated, how much of
   the API allowance is left, and lets you start a backfill. The parameter
   sections below it are for when you want to argue with the engine.

   Every numeric field is validated on the server and the failures come back as
   a list, so a bad value shows all the problems at once rather than one at a
   time. */

export default function SettingsView({
  session,
  state,
  onChanged,
}: {
  session: ReturnType<typeof useSession>;
  state: FxState | null;
  onChanged: () => void;
}) {
  const [settings, setSettings] = useState<FxSettings | null>(null);
  const [draft, setDraft] = useState<FxSettings | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/fx/settings", { cache: "no-store" });
      const body = await response.json();
      if (response.ok) {
        setSettings(body.settings as FxSettings);
        setDraft(body.settings as FxSettings);
      }
    })();
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    setBusy(true);
    setIssues([]);
    setSaved(false);
    try {
      const response = await fetch("/api/fx/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await response.json();
      if (!response.ok) {
        setIssues(body.issues ?? [body.error ?? "Those settings could not be saved."]);
        return;
      }
      setSettings(body.settings as FxSettings);
      setDraft(body.settings as FxSettings);
      setSaved(true);
      onChanged();
    } finally {
      setBusy(false);
    }
  }, [draft, onChanged]);

  const dirty = JSON.stringify(settings) !== JSON.stringify(draft);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <AccessPanel session={session} />

      <DataPanel state={state} signedIn={session.signedIn === true} onChanged={onChanged} />

      {draft && (
        <>
          {issues.length > 0 && (
            <div className="panel" style={{ borderColor: "var(--fx-short-dim)" }} role="alert">
              <div style={{ padding: "12px 14px" }}>
                {issues.map((issue) => (
                  <p key={issue} style={{ margin: "0 0 4px", fontSize: 12.5, color: "var(--fx-short)" }}>
                    {issue}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
              gap: 12,
            }}
          >
            <Panel title="Signals">
              <div style={{ padding: 14 }}>
                <Numbers
                  fields={[
                    { key: "rsiLength", label: "RSI length", hint: "14 is the standard." },
                    { key: "rsiOversold", label: "Oversold level" },
                    { key: "rsiOverbought", label: "Overbought level" },
                    { key: "macdFast", label: "MACD fast" },
                    { key: "macdSlow", label: "MACD slow" },
                    { key: "macdSignal", label: "MACD signal" },
                    {
                      key: "swingSpan",
                      label: "Swing span",
                      hint: "Bars either side of a pivot. Larger means fewer, more significant turning points.",
                    },
                    {
                      key: "divergenceLookback",
                      label: "Divergence lookback",
                      hint: "How far back a divergence may reach, in bars.",
                    },
                  ]}
                  values={draft.rules as unknown as Record<string, number>}
                  onChange={(key, value) =>
                    setDraft({ ...draft, rules: { ...draft.rules, [key]: value } })
                  }
                />
              </div>
            </Panel>

            <Panel title="Historical analogs">
              <div style={{ padding: 14 }}>
                <Numbers
                  fields={[
                    {
                      key: "window",
                      label: "Window length",
                      hint: "How many bars of shape are compared. Longer is more specific and finds fewer matches.",
                    },
                    {
                      key: "horizon",
                      label: "Forward horizon",
                      hint: "How many bars ahead the outcome is measured over.",
                    },
                    { key: "topK", label: "Matches to keep" },
                    {
                      key: "minSeparation",
                      label: "Minimum separation",
                      hint: "Bars between two kept matches, so one afternoon cannot count twice.",
                    },
                    { key: "maxDistance", label: "Distance limit", step: 0.01 },
                    { key: "shapeWeight", label: "Shape weight", step: 0.05 },
                    { key: "rsiWeight", label: "RSI weight", step: 0.05 },
                    { key: "macdWeight", label: "MACD weight", step: 0.05 },
                    { key: "stopAtr", label: "Stop, in ATR", step: 0.1 },
                    { key: "targetAtr", label: "Target, in ATR", step: 0.1 },
                  ]}
                  values={draft.similarity as unknown as Record<string, number>}
                  onChange={(key, value) =>
                    setDraft({ ...draft, similarity: { ...draft.similarity, [key]: value } })
                  }
                />
              </div>
            </Panel>

            <Panel title="Scoring">
              <div style={{ padding: 14 }}>
                <p style={{ margin: "0 0 12px", fontSize: 11.5, color: "var(--fx-faint)", lineHeight: 1.5 }}>
                  These are the maximum points each component can contribute. They must total 100 or
                  less so the score stays on a 0 to 100 scale.
                </p>
                <Numbers
                  fields={[
                    { key: "similarity", label: "Historical analogs" },
                    { key: "momentum", label: "RSI and MACD" },
                    { key: "candle", label: "Candlestick" },
                    { key: "htf", label: "Higher timeframes" },
                    { key: "volatility", label: "Conditions" },
                  ]}
                  values={draft.weights as unknown as Record<string, number>}
                  onChange={(key, value) =>
                    setDraft({ ...draft, weights: { ...draft.weights, [key]: value } })
                  }
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Field label="Alert threshold" hint="Setups at or above this raise an alert.">
                    <input
                      type="number"
                      value={draft.alertThreshold}
                      onChange={(e) =>
                        setDraft({ ...draft, alertThreshold: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Minimum score" hint="Below this, a setup is not shown at all.">
                    <input
                      type="number"
                      value={draft.minScore}
                      onChange={(e) => setDraft({ ...draft, minScore: Number(e.target.value) })}
                    />
                  </Field>
                </div>
              </div>
            </Panel>

            <Panel title="Paper account">
              <div style={{ padding: 14 }}>
                <Numbers
                  fields={[
                    {
                      key: "startingBalance",
                      label: "Starting balance",
                      hint: "Applies the next time the account is reset.",
                    },
                    { key: "leverage", label: "Leverage" },
                    {
                      key: "spreadPips",
                      label: "Spread in pips",
                      step: 0.1,
                      hint: "Charged on every fill. A realistic figure here is what keeps the results honest.",
                    },
                    { key: "riskPercent", label: "Risk per trade %", step: 0.1 },
                  ]}
                  values={draft.paper as unknown as Record<string, number>}
                  onChange={(key, value) =>
                    setDraft({ ...draft, paper: { ...draft.paper, [key]: value } })
                  }
                />
              </div>
            </Panel>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-accent"
              disabled={!dirty || busy || session.signedIn !== true}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save settings"}
            </button>
            {dirty && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(settings);
                  setIssues([]);
                }}
              >
                Discard changes
              </button>
            )}
            {saved && !dirty && (
              <span style={{ fontSize: 12.5, color: "var(--fx-long)" }}>
                Saved. Run a scan to apply them to the current bars.
              </span>
            )}
            {session.signedIn !== true && (
              <span style={{ fontSize: 12.5, color: "var(--fx-tape)" }}>
                Sign in above to change these.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Numbers({
  fields,
  values,
  onChange,
}: {
  fields: { key: string; label: string; hint?: string; step?: number }[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 8px" }}>
      {fields.map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint}>
          <input
            type="number"
            step={field.step ?? 1}
            value={values[field.key]}
            onChange={(e) => onChange(field.key, Number(e.target.value))}
          />
        </Field>
      ))}
    </div>
  );
}

function AccessPanel({ session }: { session: ReturnType<typeof useSession> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session.signedIn === null) return null;

  if (!session.configured) {
    return (
      <Panel title="Access">
        <Notice title="No access password is set on the server">
          Set FX_ACCESS_PASSWORD in the environment to unlock the controls that spend the market
          data allowance, change the settings or move the paper account. Until then the tool is
          read-only, which is the safe default for a public URL.
        </Notice>
      </Panel>
    );
  }

  if (session.signedIn) {
    return (
      <Panel title="Access">
        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12.5, color: "var(--fx-long)", flex: 1 }}>
            Signed in. Backfills, scans, settings and the paper account are unlocked.
          </span>
          <button type="button" className="btn" onClick={() => void session.signOut()}>
            Sign out
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Access">
      <form
        style={{ padding: "12px 14px", display: "flex", gap: 8, alignItems: "flex-end" }}
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const message = await session.signIn(password);
          setError(message);
          setBusy(false);
          if (!message) setPassword("");
        }}
      >
        <div style={{ flex: 1, maxWidth: 280 }}>
          <label htmlFor="fx-password">Password</label>
          <input
            id="fx-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <button type="submit" className="btn btn-accent" disabled={busy || password.length === 0}>
          {busy ? "Checking…" : "Sign in"}
        </button>
        {error && <span style={{ fontSize: 12.5, color: "var(--fx-short)" }}>{error}</span>}
      </form>
    </Panel>
  );
}

/* The data panel: what history exists, how fresh it is, and how to get more. */
function DataPanel({
  state,
  signedIn,
  onChanged,
}: {
  state: FxState | null;
  signedIn: boolean;
  onChanged: () => void;
}) {
  const [busyTf, setBusyTf] = useState<TimeframeId | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const backfill = async (tf: TimeframeId) => {
    setBusyTf(tf);
    setMessage(null);
    try {
      const response = await fetch("/api/fx/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tf }),
      });
      const body = await response.json();
      setMessage(
        response.ok
          ? "Downloading " +
              timeframe(tf).label +
              " history in the background. It keeps running if you leave this page; come back in a few minutes."
          : body.error ?? "Could not start the download.",
      );
    } finally {
      setBusyTf(null);
    }
  };

  const scan = async (live: boolean) => {
    setScanning(true);
    setMessage(null);
    try {
      const response = await fetch("/api/fx/scan?live=" + (live ? "1" : "0"), { method: "POST" });
      const body = await response.json();
      setMessage(
        response.ok
          ? live
            ? "Fetched fresh candles and rescanned."
            : "Rescanned the stored candles with the current settings."
          : body.error ?? "The scan did not run.",
      );
      onChanged();
    } finally {
      setScanning(false);
    }
  };

  return (
    <Panel
      title="Data"
      action={
        signedIn && (
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 26, fontSize: 11.5 }}
              disabled={scanning}
              onClick={() => void scan(false)}
              title="Re-run the analysis over the candles already stored. Costs no API credits."
            >
              Rescan
            </button>
            <button
              type="button"
              className="btn"
              style={{ minHeight: 26, fontSize: 11.5 }}
              disabled={scanning || !state?.budget.canSpend}
              onClick={() => void scan(true)}
              title="Fetch fresh candles first. Spends one API credit."
            >
              Fetch and scan
            </button>
          </div>
        )
      }
    >
      <div style={{ padding: 14, display: "grid", gap: 14 }}>
        {message && (
          <p style={{ margin: 0, fontSize: 12.5, color: "var(--fx-tape)", lineHeight: 1.5 }}>
            {message}
          </p>
        )}

        {state && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: 14,
            }}
          >
            <Stat
              label="Scheduler"
              value={state.scheduler.running ? "Running" : "Off"}
              tone={state.scheduler.running ? "long" : "neutral"}
              hint="Set FX_SCHEDULER=on to have the server scan every five minutes."
            />
            <Stat
              label="Market"
              value={state.scheduler.marketOpen ? "Open" : "Closed"}
              tone={state.scheduler.marketOpen ? "long" : "neutral"}
            />
            <Stat
              label="API today"
              value={state.budget.dayCount + " / " + state.budget.dayCeiling}
              tone={state.budget.canSpend ? "neutral" : "short"}
              hint="Calls to the live price feed. Resets at midnight UTC."
            />
            <Stat
              label="Live feed"
              value={state.scheduler.hasApiKey ? "Configured" : "No key"}
              tone={state.scheduler.hasApiKey ? "neutral" : "tape"}
              hint="Set FX_TWELVEDATA_KEY to enable live updates. Without it, only backfilled history is available."
            />
          </div>
        )}

        {state?.scheduler.lastError && (
          <p style={{ margin: 0, fontSize: 12, color: "var(--fx-short)" }}>
            Last problem: {state.scheduler.lastError}
          </p>
        )}

        <div style={{ overflowX: "auto" }} className="thin-scroll">
          <table>
            <thead>
              <tr>
                <th>Timeframe</th>
                <th className="num">Bars</th>
                <th>From</th>
                <th>Last bar</th>
                <th className="num">Worst gap</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {TIMEFRAMES.map((tf) => {
                const status = state?.data.find((d) => d.tf === tf.id);
                const bars = status?.bars ?? 0;
                // A timeframe needs roughly a few hundred bars before the
                // analog search has anything to work with.
                const thin = bars > 0 && bars < 400;

                return (
                  <tr key={tf.id}>
                    <td>
                      <strong>{tf.label}</strong>
                    </td>
                    <td className="num" style={{ color: thin ? "var(--fx-tape)" : undefined }}>
                      {bars === 0 ? "—" : compact(bars)}
                    </td>
                    <td className="muted">{status?.firstBar ? dateOnly(status.firstBar) : "—"}</td>
                    <td className="muted">{status?.lastBar ? ago(status.lastBar) : "never"}</td>
                    <td className="num muted">{status?.largestGap ?? 0}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        style={{ minHeight: 24, padding: "0 8px", fontSize: 11 }}
                        disabled={!signedIn || busyTf !== null}
                        onClick={() => void backfill(tf.id)}
                        title={"Download " + tf.backfillYears + " years from Dukascopy. Free, no API credits."}
                      >
                        {busyTf === tf.id ? "Starting…" : bars === 0 ? "Download" : "Top up"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ margin: 0, fontSize: 11.5, color: "var(--fx-faint)", lineHeight: 1.55 }}>
          History comes from Dukascopy, which is free and reaches back decades but publishes in
          arrears. The live feed fills the last hour. Bars are stamped in UTC and built on UTC
          boundaries, so the daily bar here opens at midnight UTC rather than at 17:00 New York the
          way TradingView draws it — the same day&apos;s range, cut at a different point.
        </p>
      </div>
    </Panel>
  );
}
