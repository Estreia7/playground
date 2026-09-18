"use client";

import type { Setup } from "../types.ts";
import { timeframe } from "../timeframes.ts";
import { price, pips, barTime, pct } from "../format.ts";
import { ScoreBadge, DirectionTag, ComponentBar, Notice } from "../ui/parts.tsx";

/* The ranked list of candidates, and the detail behind one of them.

   A card says what it is, how strong it is, and why — in that order. The score
   is never shown on its own: the evidence chips sit directly under it, and
   opening a card breaks the number into the five components that made it. The
   whole point of the tool is that you can disagree with it. */

export function SetupList({
  setups,
  selectedId,
  onSelect,
  onTrade,
  emptyHint,
}: {
  setups: Setup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onTrade: (setup: Setup) => void;
  emptyHint?: string;
}) {
  if (setups.length === 0) {
    return (
      <Notice title="Nothing worth flagging">
        {emptyHint ??
          "No setup on this timeframe cleared the minimum score. Most bars are not the start of anything, so this is the normal state."}
      </Notice>
    );
  }

  return (
    <div className="thin-scroll" style={{ overflowY: "auto" }}>
      {setups.map((setup) => (
        <SetupCard
          key={setup.id}
          setup={setup}
          expanded={setup.id === selectedId}
          onSelect={onSelect}
          onTrade={onTrade}
        />
      ))}
    </div>
  );
}

function SetupCard({
  setup,
  expanded,
  onSelect,
  onTrade,
}: {
  setup: Setup;
  expanded: boolean;
  onSelect: (id: string | null) => void;
  onTrade: (setup: Setup) => void;
}) {
  const htf = setup.components.find((c) => c.key === "htf");
  const htfAligned = htf ? htf.points === htf.max : false;
  const htfPartial = htf ? htf.points > 0 && htf.points < htf.max : false;

  return (
    <article
      style={{
        borderBottom: "1px solid var(--fx-rule)",
        background: expanded ? "var(--fx-raised)" : "transparent",
      }}
    >
      <button
        type="button"
        onClick={() => onSelect(expanded ? null : setup.id)}
        aria-expanded={expanded}
        style={{
          display: "flex",
          gap: 12,
          width: "100%",
          padding: "12px 14px",
          background: "none",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "inherit",
          alignItems: "flex-start",
        }}
      >
        <ScoreBadge score={setup.score} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <DirectionTag direction={setup.direction} />
            <span className="chip">{timeframe(setup.tf).label}</span>
            {htfAligned && <span className="chip chip-tape">Trend agrees</span>}
            {htfPartial && <span className="chip">Trend mixed</span>}
          </div>

          <p
            style={{
              margin: "7px 0 0",
              fontSize: 12.5,
              color: "var(--fx-muted)",
              lineHeight: 1.45,
            }}
          >
            {setup.evidence.length > 0
              ? setup.evidence.map((e) => e.name).join(" · ")
              : "Scored on historical analogs alone."}
          </p>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginTop: 7,
              fontSize: 11.5,
              color: "var(--fx-faint)",
            }}
            className="mono"
          >
            <span>{price(setup.price)}</span>
            <span>{barTime(setup.barTime)}</span>
            {setup.stats && (
              <span title="Win rate of similar past windows, against the market's own baseline">
                {pct(setup.stats.winRate)} of {setup.stats.count}
              </span>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: "0 14px 14px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
              padding: "10px 12px",
              marginBottom: 12,
              background: "var(--fx-ink)",
              border: "1px solid var(--fx-rule)",
              borderRadius: 6,
            }}
          >
            <Level label="Entry" value={price(setup.suggested.entry)} />
            <Level
              label="Stop"
              value={price(setup.suggested.stop)}
              sub={pips(-setup.suggested.stopPips) + "p"}
              tone="short"
            />
            <Level
              label="Target"
              value={price(setup.suggested.target)}
              sub={pips(setup.suggested.targetPips) + "p"}
              tone="long"
            />
          </div>

          <div className="eyebrow" style={{ marginBottom: 8 }}>
            Where the {setup.score} comes from
          </div>
          {setup.components.map((component) => (
            <ComponentBar key={component.key} component={component} />
          ))}

          <button
            type="button"
            className="btn btn-accent"
            style={{ width: "100%", marginTop: 6 }}
            onClick={() => onTrade(setup)}
          >
            Trade this in the paper account
          </button>
        </div>
      )}
    </article>
  );
}

function Level({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "long" | "short";
}) {
  const colour =
    tone === "long" ? "var(--fx-long)" : tone === "short" ? "var(--fx-short)" : "var(--fx-text)";
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--fx-faint)", marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 500, color: colour }}>
        {value}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 10.5, color: "var(--fx-faint)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
