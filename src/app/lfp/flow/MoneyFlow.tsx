"use client";

/* MoneyFlow — the signature element.
   A carteira das famílias on one side, o Estado on the other, joined by lanes
   whose THICKNESS IS THE DATA. The rigging and compass are ornament laid over
   what is honestly a Sankey diagram, so the picture cannot lie.

   Accessibility contract: the SVG is role="img" with a generated summary, and
   every caller renders the same numbers as a real table beneath it. With all
   motion removed the diagram still teaches — that is the design test. */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useAnimationFrame, useReducedMotion } from "framer-motion";
import { useLfpLang } from "../useLfpLang";
import type { FlowStream } from "../types";
import {
  computeLanes,
  poleAnchors,
  pointOnCubic,
  sumAmounts,
  STAGE_H,
  STAGE_V,
  type LaneGeometry,
  type StageBox,
} from "./flowGeometry";

export interface MoneyFlowProps {
  origin: { label: string; total: number };
  destination: { label: string; total: number };
  streams: FlowStream[];
  baseline?: number;
  /** "ambient" = slow decorative loop, no figures. "result" = labelled data. */
  mode?: "ambient" | "result";
  activeStreamId?: string | null;
  onStreamHover?: (id: string | null) => void;
  formatAmount?: (n: number) => string;
  ariaLabel?: string;
  /** What the hub figure IS: "bruto" on a payslip, "custo total" for an
   *  employer, "lucro tributável" for IRC. Defaults to the dictionary
   *  "bruto"; a page whose hub is not gross pay must say so. */
  hubLabel?: string;
  className?: string;
}

/** Below this width horizontal lanes stop being legible, so the stage
 *  rotates to vertical: wallet above, State below. */
const VERTICAL_BREAKPOINT = 640;

/** Stage orientation plus a mounted flag. Both the layout and the motion
 *  preference are only knowable in the browser, so the first client render
 *  must match the server exactly and correct itself afterwards. */
function useStage(): { stage: StageBox; mounted: boolean } {
  const [stage, setStage] = useState<StageBox>(STAGE_H);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia(`(max-width: ${VERTICAL_BREAKPOINT - 1}px)`);
    const apply = () => setStage(mq.matches ? STAGE_V : STAGE_H);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return { stage, mounted };
}

/** One rAF for every particle in the diagram, writing straight to the DOM.
 *  Per-particle framer animations would mean dozens of independent tweens. */
function Particles({
  lanes,
  streams,
  reduced,
  mounted,
}: {
  lanes: LaneGeometry[];
  streams: FlowStream[];
  reduced: boolean;
  /** False during SSR and the first client render, so both agree. */
  mounted: boolean;
}) {
  const groupRef = useRef<SVGGElement>(null);

  const dots = useMemo(() => {
    const out: Array<{ key: string; lane: LaneGeometry; phase: number; tone: string }> = [];
    lanes.forEach((lane) => {
      const stream = streams.find((s) => s.id === lane.id);
      if (!stream) return;
      lane.particleDelays.forEach((phase, i) => {
        out.push({ key: `${lane.id}-${i}`, lane, phase, tone: stream.tone });
      });
    });
    return out;
  }, [lanes, streams]);

  useAnimationFrame((t) => {
    const g = groupRef.current;
    if (!g || reduced) return;
    // ~4.5s per traversal.
    const base = (t / 4500) % 1;
    const nodes = g.children;
    for (let i = 0; i < dots.length && i < nodes.length; i++) {
      const { lane, phase } = dots[i];
      const p = pointOnCubic(lane.curve, (base + phase) % 1);
      const el = nodes[i] as SVGCircleElement;
      el.setAttribute("cx", String(p.x));
      el.setAttribute("cy", String(p.y));
    }
  });

  // Reduced motion: no particles at all — the lanes and figures carry the meaning.
  // Also skipped before mount: the server cannot know the motion preference, so
  // rendering particles there and dropping them on the client would desync the
  // trees and make React throw away the whole diagram.
  if (reduced || !mounted) return null;


  return (
    <g ref={groupRef} aria-hidden="true">
      {dots.map(({ key, lane, phase, tone }) => {
        const p = pointOnCubic(lane.curve, phase);
        return (
          <circle
            key={key}
            cx={p.x}
            cy={p.y}
            r={Math.max(2.2, Math.min(lane.width * 0.22, 5))}
            fill={`var(--lfp-tone-${tone})`}
            opacity={0.85}
          />
        );
      })}
    </g>
  );
}

function Wallet({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <rect
        x={-52}
        y={-40}
        width={104}
        height={80}
        rx={12}
        fill="var(--lfp-cal-tile)"
        stroke="var(--lfp-cobalt)"
        strokeWidth={2.5}
      />
      <rect
        x={-44}
        y={-32}
        width={88}
        height={64}
        rx={8}
        fill="none"
        stroke="var(--lfp-cobalt)"
        strokeWidth={1}
        opacity={0.35}
      />
      {/* Clasp */}
      <rect x={18} y={-9} width={30} height={18} rx={9} fill="var(--lfp-cobalt)" opacity={0.9} />
      <circle cx={33} cy={0} r={3.4} fill="var(--lfp-cal-tile)" />
    </g>
  );
}

/** The State as a flat Pombaline arcade — reads as "instituição" without
 *  pretending to be one specific building. */
function Arcade({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const arches = [-36, -12, 12, 36];
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      <rect
        x={-58}
        y={-44}
        width={116}
        height={88}
        rx={6}
        fill="var(--lfp-cal-tile)"
        stroke="var(--lfp-cobalt)"
        strokeWidth={2.5}
      />
      {/* Cornice */}
      <rect x={-64} y={-52} width={128} height={12} rx={3} fill="var(--lfp-cobalt)" />
      {arches.map((ax) => (
        <path
          key={ax}
          d={`M ${ax - 8} 40 L ${ax - 8} 8 A 8 8 0 0 1 ${ax + 8} 8 L ${ax + 8} 40 Z`}
          fill="var(--lfp-cobalt)"
          opacity={0.82}
        />
      ))}
    </g>
  );
}

function Compass({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const long = i % 2 === 0;
    const len = long ? r : r * 0.55;
    return `M ${cx} ${cy} L ${cx + Math.cos(a) * len} ${cy + Math.sin(a) * len}`;
  });
  return (
    <g className="lfp-compass" style={{ transformOrigin: `${cx}px ${cy}px` }} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--lfp-cobalt)" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="none" stroke="var(--lfp-cobalt)" strokeWidth={0.6} />
      {pts.map((d, i) => (
        <path key={i} d={d} stroke="var(--lfp-cobalt)" strokeWidth={0.7} />
      ))}
    </g>
  );
}

export function MoneyFlow({
  origin,
  destination,
  streams,
  baseline,
  mode = "result",
  activeStreamId = null,
  onStreamHover,
  formatAmount,
  ariaLabel,
  hubLabel,
  className,
}: MoneyFlowProps) {
  const { stage, mounted } = useStage();
  const prefersReduced = useReducedMotion();
  const reduced = prefersReduced ?? false;
  const uid = useId().replace(/:/g, "");
  const { t } = useLfpLang();
  const hub = hubLabel ?? t.chrome.flow.bruto;

  const visible = useMemo(() => streams.filter((s) => s.amount > 0), [streams]);
  const total = baseline ?? sumAmounts(visible);

  const lanes = useMemo(
    () => computeLanes(visible, { baseline: total, stage }),
    [visible, total, stage]
  );

  const { origin: oPos, destination: dPos } = poleAnchors(stage);
  const fmt = formatAmount ?? ((n: number) => `€${Math.round(n)}`);

  const summary =
    ariaLabel ??
    `${origin.label}: ${fmt(origin.total)}. ` +
      visible.map((s) => `${s.label}: ${fmt(s.amount)}`).join(". ") +
      `. ${destination.label}: ${fmt(destination.total)}.`;

  const poleScale = stage.layout === "v" ? 0.78 : 1;
  const showChips = mode === "result";

  // Lanes are widest at the hub, so the gross label clears the thickest one
  // rather than sitting a fixed distance away and colliding with it.
  const hubClearance =
    lanes.reduce((max, l) => Math.max(max, l.width), 0) / 2 + 14;

  return (
    <svg
      viewBox={`0 0 ${stage.width} ${stage.height}`}
      className={`block w-full ${className ?? ""}`}
      role="img"
      aria-label={summary}
    >
      <defs>
        <pattern
          id={`lfp-tile-${uid}`}
          width={40}
          height={40}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={40} height={40} fill="none" />
          <path d="M 0 20 H 40 M 20 0 V 40" stroke="var(--lfp-cobalt)" strokeWidth={0.8} />
        </pattern>
      </defs>

      <g aria-hidden="true">
        <rect
          width={stage.width}
          height={stage.height}
          fill={`url(#lfp-tile-${uid})`}
          opacity={0.045}
        />
        {/* Ornament only — kept faint so it never competes with the data. */}
        <g opacity={0.22}>
          <Compass
            cx={stage.width / 2}
            cy={stage.height / 2}
            r={stage.layout === "v" ? 62 : 78}
          />
        </g>
      </g>

      {/* Lanes — width is the data. */}
      <g>
        {lanes.map((lane) => {
          const stream = visible.find((s) => s.id === lane.id);
          if (!stream) return null;
          const dimmed = activeStreamId !== null && activeStreamId !== lane.id;
          const active = activeStreamId === lane.id;

          return (
            <g
              key={lane.id}
              onPointerEnter={() => onStreamHover?.(lane.id)}
              onPointerLeave={() => onStreamHover?.(null)}
              style={{ cursor: onStreamHover ? "pointer" : undefined }}
            >
              <title>{`${stream.label}: ${fmt(stream.amount)}`}</title>
              <motion.path
                d={lane.d}
                fill="none"
                stroke={`var(--lfp-tone-${stream.tone})`}
                strokeLinecap="round"
                initial={false}
                animate={{
                  strokeWidth: active ? lane.width * 1.15 : lane.width,
                  opacity: dimmed ? 0.25 : lane.opacity,
                }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 120, damping: 18 }
                }
              />
              <path
                className="lfp-lane-rigging"
                d={lane.d}
                strokeWidth={Math.max(1, lane.width * 0.45)}
                strokeDasharray="2 10"
                opacity={dimmed ? 0.15 : 0.5}
              />
            </g>
          );
        })}
      </g>

      <Particles lanes={lanes} streams={visible} reduced={reduced} mounted={mounted} />

      {/* The split point. Gross pay arrives here and divides — showing the
          baseline makes the two directions legible as parts of one whole. */}
      {showChips && (
        <g aria-hidden="true">
          <circle
            cx={stage.width / 2}
            cy={stage.height / 2}
            r={7}
            fill="var(--lfp-cal-tile)"
            stroke="var(--lfp-cobalt)"
            strokeWidth={2}
          />
          {/* Lanes converge on the hub along the travel axis, so the label
              steps aside: above it when horizontal, beside it when vertical. */}
          {stage.layout === "v" ? (
            <text
              className="lfp-num"
              x={stage.width / 2 + 18}
              y={stage.height / 2 + 4}
              textAnchor="start"
              fontSize={12}
              fontWeight={600}
              fill="var(--lfp-cobalt-deep)"
            >
              {fmt(total)} {hub}
            </text>
          ) : (
            <>
              <text
                className="lfp-num"
                x={stage.width / 2}
                y={stage.height / 2 - hubClearance - 16}
                textAnchor="middle"
                fontSize={9}
                letterSpacing="0.12em"
                fill="var(--lfp-mist)"
              >
                {hub.toUpperCase()}
              </text>
              <text
                className="lfp-num"
                x={stage.width / 2}
                y={stage.height / 2 - hubClearance}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--lfp-cobalt-deep)"
              >
                {fmt(total)}
              </text>
            </>
          )}
        </g>
      )}

      <Wallet x={oPos.x} y={oPos.y} scale={poleScale} />
      <Arcade x={dPos.x} y={dPos.y} scale={poleScale} />

      {/* Pole labels */}
      <g className="lfp-num" fontSize={13} textAnchor="middle">
        <text
          x={oPos.x}
          y={oPos.y + (stage.layout === "v" ? -56 : 64)}
          fill="var(--lfp-cobalt-deep)"
          fontWeight={600}
        >
          {origin.label}
        </text>
        {showChips && (
          <text
            x={oPos.x}
            y={oPos.y + (stage.layout === "v" ? -38 : 82)}
            fill="var(--lfp-verde)"
            fontSize={15}
            fontWeight={600}
          >
            {fmt(origin.total)}
          </text>
        )}
        <text
          x={dPos.x}
          y={dPos.y + (stage.layout === "v" ? 68 : 64)}
          fill="var(--lfp-cobalt-deep)"
          fontWeight={600}
        >
          {destination.label}
        </text>
        {showChips && (
          <text
            x={dPos.x}
            y={dPos.y + (stage.layout === "v" ? 86 : 82)}
            fill="var(--lfp-vermelho)"
            fontSize={15}
            fontWeight={600}
          >
            {fmt(destination.total)}
          </text>
        )}
      </g>

      {/* Amount chips — the exact truth beside each lane. */}
      {showChips && (
        <g className="lfp-num" fontSize={12}>
          {lanes.map((lane) => {
            const stream = visible.find((s) => s.id === lane.id);
            if (!stream) return null;
            const dimmed = activeStreamId !== null && activeStreamId !== lane.id;
            const label = fmt(stream.amount);
            const w = label.length * 7.2 + 14;
            return (
              <g key={lane.id} opacity={dimmed ? 0.3 : 1}>
                <rect
                  x={lane.midpoint.x - w / 2}
                  y={lane.midpoint.y - 11}
                  width={w}
                  height={22}
                  rx={11}
                  fill="var(--lfp-cal-tile)"
                  stroke="var(--lfp-line)"
                />
                <text
                  x={lane.midpoint.x}
                  y={lane.midpoint.y + 4}
                  textAnchor="middle"
                  fill={`var(--lfp-tone-${stream.tone})`}
                  fontWeight={600}
                >
                  {label}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );
}

export default MoneyFlow;
