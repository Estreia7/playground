"use client";

import type { ReactNode } from "react";
import type { Direction, ScoreComponent } from "../types.ts";

/* Small shared pieces. Kept together because each is a handful of lines and
   splitting them across files would cost more in imports than it saves. */

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      {title && (
        <header className="panel-head">
          <h2 className="eyebrow">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

/* The score badge.

   Colour follows the score, but the number is always there in full: a reader
   who cannot tell amber from grey still gets the figure. The ring is a
   conic gradient rather than an SVG arc because it costs one element. */
export function ScoreBadge({ score, size = 44 }: { score: number; size?: number }) {
  const strength = score >= 70 ? "strong" : score >= 55 ? "fair" : "weak";
  const colour =
    strength === "strong" ? "var(--fx-tape)" : strength === "fair" ? "#8a97a6" : "#5d6874";

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background:
          "conic-gradient(" + colour + " " + score + "%, var(--fx-rule) " + score + "% 100%)",
        display: "grid",
        placeItems: "center",
        flexShrink: 0,
      }}
      title={"Score " + score + " of 100"}
    >
      <div
        style={{
          width: size - 7,
          height: size - 7,
          borderRadius: "50%",
          background: "var(--fx-panel)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <span
          className="mono display"
          style={{ fontSize: size * 0.34, fontWeight: 600, color: colour, lineHeight: 1 }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

/** Direction is never colour alone: the word rides along with it. */
export function DirectionTag({ direction }: { direction: Direction }) {
  const long = direction === "long";
  return (
    <span className={"chip " + (long ? "chip-long" : "chip-short")}>
      <span aria-hidden="true">{long ? "▲" : "▼"}</span>
      {long ? "Long" : "Short"}
    </span>
  );
}

/** A component of the score as a labelled bar, so the total can be taken
    apart at a glance. */
export function ComponentBar({ component }: { component: ScoreComponent }) {
  const fraction = component.max === 0 ? 0 : component.points / component.max;
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 8,
          marginBottom: 3,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--fx-text)" }}>{component.label}</span>
        <span className="mono" style={{ fontSize: 11.5, color: "var(--fx-muted)" }}>
          {component.points.toFixed(1)}
          <span className="faint"> / {component.max}</span>
        </span>
      </div>
      <div
        style={{
          height: 4,
          borderRadius: 999,
          background: "var(--fx-rule)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: Math.max(0, Math.min(100, fraction * 100)) + "%",
            height: "100%",
            background: fraction > 0.66 ? "var(--fx-tape)" : "var(--fx-muted)",
            transition: "width 200ms ease",
          }}
        />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "var(--fx-muted)", lineHeight: 1.45 }}>
        {component.detail}
      </p>
    </div>
  );
}

export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "long" | "short" | "tape";
  hint?: string;
}) {
  const colour =
    tone === "long"
      ? "var(--fx-long)"
      : tone === "short"
        ? "var(--fx-short)"
        : tone === "tape"
          ? "var(--fx-tape)"
          : "var(--fx-text)";

  return (
    <div title={hint}>
      <div className="eyebrow" style={{ marginBottom: 3 }}>
        {label}
      </div>
      <div className="mono display" style={{ fontSize: 19, fontWeight: 600, color: colour }}>
        {value}
      </div>
    </div>
  );
}

/** Empty, loading and error states all look the same and all say what to do
    next, because a blank panel is indistinguishable from a broken one. */
export function Notice({
  title,
  children,
  tone = "muted",
}: {
  title: string;
  children?: ReactNode;
  tone?: "muted" | "error";
}) {
  return (
    <div
      style={{
        padding: "28px 20px",
        textAlign: "center",
        color: tone === "error" ? "var(--fx-short)" : "var(--fx-muted)",
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--fx-text)" }}>{title}</p>
      {children && (
        <div style={{ margin: "6px auto 0", fontSize: 12.5, maxWidth: 420, lineHeight: 1.5 }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label>{label}</label>
      {children}
      {hint && (
        <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--fx-faint)", lineHeight: 1.4 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
