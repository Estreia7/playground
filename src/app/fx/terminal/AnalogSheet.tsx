"use client";

import { useMemo } from "react";
import type { Analog, AnalogStats, Direction } from "../types.ts";
import { pips, dateOnly, pct } from "../format.ts";
import { Notice } from "../ui/parts.tsx";

/* The analog sheet — a contact sheet of the past.

   This is the evidence behind the score, shown rather than summarised. Each
   thumbnail is one historical window that resembled the present: the solid
   line is the shape that matched, the faint line is what happened next, and
   the number is where it ended up.

   Laid out as a grid because the pattern that matters is in the aggregate. A
   wall of mostly-rising tails is an argument; one cherry-picked example is
   not. The histogram underneath makes the same point numerically, including
   the losses, which is the part a bullish summary usually leaves out. */

interface AnalogSheetProps {
  analogs: Analog[];
  stats: AnalogStats | null;
  direction: Direction;
  onHover: (analog: Analog | null) => void;
  hovered: Analog | null;
}

export default function AnalogSheet({
  analogs,
  stats,
  direction,
  onHover,
  hovered,
}: AnalogSheetProps) {
  // Best matches first: distance is the whole ranking.
  const ordered = useMemo(
    () => [...analogs].sort((a, b) => a.distance - b.distance),
    [analogs],
  );

  if (ordered.length === 0) {
    return (
      <Notice title="No comparable windows">
        Nothing in the stored history resembles the current price action closely enough to
        measure. Backfilling more years for this timeframe would give the search more to work
        with.
      </Notice>
    );
  }

  return (
    <div>
      {stats && <StatsRow stats={stats} direction={direction} />}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))",
          gap: 8,
          padding: "12px 14px",
        }}
      >
        {ordered.map((analog) => (
          <Thumbnail
            key={analog.barTime}
            analog={analog}
            direction={direction}
            active={hovered?.barTime === analog.barTime}
            onHover={onHover}
          />
        ))}
      </div>

      {stats && stats.histogram.length > 0 && <Histogram stats={stats} />}
    </div>
  );
}

function StatsRow({ stats, direction }: { stats: AnalogStats; direction: Direction }) {
  const edge = stats.winRate - stats.baselineWinRate;
  // The edge is the number that matters, so it gets the plain-English reading.
  const verdict =
    edge >= 0.08
      ? { text: "a clear edge", tone: "var(--fx-tape)" }
      : edge >= 0.03
        ? { text: "a slight edge", tone: "var(--fx-text)" }
        : edge <= -0.03
          ? { text: "worse than random", tone: "var(--fx-short)" }
          : { text: "no real edge", tone: "var(--fx-muted)" };

  return (
    <div
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid var(--fx-rule)",
        display: "grid",
        gap: 10,
      }}
    >
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--fx-muted)" }}>
        Of the{" "}
        <strong className="mono" style={{ color: "var(--fx-text)" }}>
          {stats.count}
        </strong>{" "}
        times the market looked like this,{" "}
        <strong className="mono" style={{ color: "var(--fx-text)" }}>
          {pct(stats.winRate)}
        </strong>{" "}
        went on to move in favour of a {direction}, against{" "}
        <strong className="mono">{pct(stats.baselineWinRate)}</strong> for any window at random.
        That is <strong style={{ color: verdict.tone }}>{verdict.text}</strong>.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
          gap: 10,
        }}
      >
        <MiniStat label="Average" value={pips(stats.avgPips) + "p"} />
        <MiniStat label="Median" value={pips(stats.medianPips) + "p"} />
        <MiniStat label="Best" value={pips(stats.bestPips) + "p"} tone="long" />
        <MiniStat label="Worst" value={pips(stats.worstPips) + "p"} tone="short" />
        <MiniStat
          label="Typical run-up"
          value={pips(stats.avgMfePips) + "p"}
          hint="How far the average analog went in favour before it finished."
        />
        <MiniStat
          label="Typical drawdown"
          value={pips(stats.avgMaePips) + "p"}
          hint="How far the average analog went against before it finished. Your stop has to survive this."
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "long" | "short";
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div style={{ fontSize: 10, color: "var(--fx-faint)", marginBottom: 2 }}>{label}</div>
      <div
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: 500,
          color:
            tone === "long"
              ? "var(--fx-long)"
              : tone === "short"
                ? "var(--fx-short)"
                : "var(--fx-text)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* One thumbnail: the matched window solid, the outcome faint.

   Drawn as an inline SVG polyline. At this size a canvas would be overkill and
   an image would not scale; the whole sheet is fifty of these and stays well
   inside a frame budget. */
function Thumbnail({
  analog,
  direction,
  active,
  onHover,
}: {
  analog: Analog;
  direction: Direction;
  active: boolean;
  onHover: (analog: Analog | null) => void;
}) {
  const W = 104;
  const Hgt = 46;
  const shape = analog.shape;
  const forward = analog.forwardShape;
  const total = shape.length + forward.length;
  if (total < 2) return null;

  const x = (i: number) => (i / (total - 1)) * (W - 2) + 1;
  const y = (v: number) => Hgt - 4 - v * (Hgt - 8);

  const past = shape.map((v, i) => x(i) + "," + y(v)).join(" ");
  const future = forward.map((v, i) => x(shape.length + i) + "," + y(v)).join(" ");
  // Join the two paths so the line does not break at the hand-off.
  const bridge =
    shape.length > 0 && forward.length > 0
      ? x(shape.length - 1) + "," + y(shape[shape.length - 1]) + " "
      : "";

  // Did this analog go the setup's way? The sign convention in the data is for
  // a long, so a short reads it inverted.
  const favourable =
    direction === "long" ? analog.forwardPips > 0 : analog.forwardPips < 0;
  const outcomeColour = favourable ? "var(--fx-long)" : "var(--fx-short)";
  const shown = direction === "long" ? analog.forwardPips : -analog.forwardPips;

  return (
    <figure
      style={{
        margin: 0,
        border: "1px solid " + (active ? "var(--fx-tape)" : "var(--fx-rule)"),
        borderRadius: 6,
        background: active ? "var(--fx-raised)" : "var(--fx-ink)",
        overflow: "hidden",
        cursor: "crosshair",
        transition: "border-color 120ms ease, background 120ms ease",
      }}
      onMouseEnter={() => onHover(analog)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(analog)}
      onBlur={() => onHover(null)}
      tabIndex={0}
      aria-label={
        "Match from " +
        dateOnly(analog.barTime) +
        ", which then moved " +
        pips(shown) +
        " pips " +
        (favourable ? "in favour" : "against") +
        "."
      }
    >
      <svg width="100%" viewBox={"0 0 " + W + " " + Hgt} role="presentation">
        {/* The hand-off point: where "what matched" ends and "what happened
            next" begins. */}
        <line
          x1={x(shape.length - 1)}
          y1={2}
          x2={x(shape.length - 1)}
          y2={Hgt - 2}
          stroke="var(--fx-rule)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <polyline points={past} fill="none" stroke="var(--fx-muted)" strokeWidth="1.25" />
        <polyline
          points={bridge + future}
          fill="none"
          stroke={outcomeColour}
          strokeWidth="1.25"
          opacity="0.85"
        />
      </svg>
      <figcaption
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 4,
          padding: "3px 5px 4px",
          borderTop: "1px solid var(--fx-rule)",
        }}
      >
        <span className="mono" style={{ fontSize: 9.5, color: "var(--fx-faint)" }}>
          {dateOnly(analog.barTime).slice(0, 6)}
        </span>
        <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: outcomeColour }}>
          {pips(shown)}
        </span>
      </figcaption>
    </figure>
  );
}

/* The distribution of outcomes, losses included.

   A win rate hides the shape of the losses. Twelve small wins and one
   catastrophic loss is a 92% win rate and a losing strategy, and only the
   histogram shows it. */
function Histogram({ stats }: { stats: AnalogStats }) {
  const max = Math.max(...stats.histogram.map((b) => b.count), 1);

  return (
    <div style={{ padding: "12px 14px", borderTop: "1px solid var(--fx-rule)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        Where they finished
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 58 }}>
        {stats.histogram.map((bucket, i) => {
          const losing = bucket.to <= 0;
          return (
            <div
              key={i}
              style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}
              title={
                bucket.count +
                (bucket.count === 1 ? " match finished between " : " matches finished between ") +
                bucket.from.toFixed(0) +
                " and " +
                bucket.to.toFixed(0) +
                " pips"
              }
            >
              <div
                style={{
                  height: Math.max(2, (bucket.count / max) * 52),
                  background: losing ? "var(--fx-short-dim)" : "var(--fx-long-dim)",
                  borderTop: "1px solid " + (losing ? "var(--fx-short)" : "var(--fx-long)"),
                  borderRadius: "2px 2px 0 0",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 5,
          fontSize: 10,
          color: "var(--fx-faint)",
        }}
        className="mono"
      >
        <span>{stats.histogram[0].from.toFixed(0)}p</span>
        <span className="faint">pips after the window</span>
        <span>{stats.histogram[stats.histogram.length - 1].to.toFixed(0)}p</span>
      </div>
    </div>
  );
}
