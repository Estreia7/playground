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
      {dots.map(({ key, lane, phase }) => {
        const p = pointOnCubic(lane.curve, phase);
        const r = Math.max(2.2, Math.min(lane.width * 0.22, 5));
        // A coin, not a dot: a pale disc with a rim, so it reads as money
        // moving along the channel rather than a loading indicator. Tinted
        // from the ground rather than the lane tone — a solid dot in the
        // lane's own colour disappears into it.
        return (
          <circle
            key={key}
            cx={p.x}
            cy={p.y}
            r={r}
            fill="var(--lfp-cal-tile)"
            stroke="var(--lfp-ouro)"
            strokeWidth={Math.max(0.8, r * 0.32)}
            opacity={0.92}
          />
        );
      })}
    </g>
  );
}

/** A leather billfold, three-quarters closed, with notes showing above the
 *  flap. Drawn in layers back-to-front — notes, body, flap, clasp — so the
 *  overlaps read as depth without a single gradient or filter: at this size
 *  a flat shape with one darker facet is sharper than any shading. */
function Wallet({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      {/* Notes, fanned, peeking above the flap. Cool cobalt tints rather
          than green: the green in this diagram means "money you keep" and
          must not be spent on decoration. */}
      <g>
        <rect x={-30} y={-46} width={62} height={26} rx={2} fill="var(--lfp-cal-tile)" stroke="var(--lfp-cobalt)" strokeWidth={1.2} transform="rotate(-7 0 -34)" />
        <rect x={-24} y={-49} width={62} height={26} rx={2} fill="var(--lfp-cal-tile)" stroke="var(--lfp-cobalt)" strokeWidth={1.2} transform="rotate(-2 0 -34)" />
        <line x1={-10} y1={-36} x2={24} y2={-36} stroke="var(--lfp-cobalt)" strokeWidth={1} opacity={0.4} />
      </g>

      {/* Body. The lower facet is the leather catching less light — one
          flat darker shape, no gradient. */}
      <path
        d="M -50 -30 h 100 a 8 8 0 0 1 8 8 v 44 a 8 8 0 0 1 -8 8 h -100 a 8 8 0 0 1 -8 -8 v -44 a 8 8 0 0 1 8 -8 z"
        fill="var(--lfp-cal-tile)"
        stroke="var(--lfp-cobalt)"
        strokeWidth={2.5}
      />
      <path d="M -58 6 h 116 v 16 a 8 8 0 0 1 -8 8 h -100 a 8 8 0 0 1 -8 -8 z" fill="var(--lfp-cobalt)" opacity={0.09} />

      {/* Flap, overlapping the body — the seam is what makes it a wallet
          rather than a box. */}
      <path
        d="M -58 -22 a 8 8 0 0 1 8 -8 h 100 a 8 8 0 0 1 8 8 v 12 h -116 z"
        fill="var(--lfp-cal-tile)"
        stroke="var(--lfp-cobalt)"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      <line x1={-58} y1={-10} x2={58} y2={-10} stroke="var(--lfp-cobalt)" strokeWidth={2.5} />
      {/* Stitching, the detail that reads as leather at any size. */}
      <path d="M -50 -2 h 100" stroke="var(--lfp-cobalt)" strokeWidth={1} strokeDasharray="3 4" opacity={0.4} />

      {/* Clasp */}
      <rect x={-9} y={-16} width={18} height={13} rx={3} fill="var(--lfp-cal-tile)" stroke="var(--lfp-cobalt)" strokeWidth={1.8} />
      <circle cx={0} cy={-9.5} r={2.4} fill="var(--lfp-ouro)" />
    </g>
  );
}

/** The State as a Pombaline elevation: a ground-floor arcade under two
 *  storeys of windows, framed by pilasters and capped with a cornice — the
 *  Baixa vocabulary rebuilt after 1755, which reads as "instituição"
 *  without pretending to be one particular ministry.
 *
 *  Every measurement is derived from a module (M) rather than typed in, so
 *  the bays stay evenly spaced and the storeys stay aligned. That is what
 *  separates architecture from a row of blobs. */
function Arcade({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  const M = 22;              // bay module
  const BAYS = 5;
  const halfW = (BAYS * M) / 2;
  const bays = Array.from({ length: BAYS }, (_, i) => -halfW + M / 2 + i * M);
  const groundY = 44;        // pavement line
  const archTop = 6;         // springing line of the arcade
  const floor1 = -8;
  const floor2 = -30;
  const corniceY = -46;

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} aria-hidden="true">
      {/* Body */}
      <rect x={-halfW} y={corniceY} width={halfW * 2} height={groundY - corniceY} fill="var(--lfp-cal-tile)" stroke="var(--lfp-cobalt)" strokeWidth={2.5} />

      {/* Storey bands: shallow lines, not heavy bars — the Baixa facades
          are quiet, and a thick band here would read as a toy. */}
      <line x1={-halfW} y1={floor1} x2={halfW} y2={floor1} stroke="var(--lfp-cobalt)" strokeWidth={1} opacity={0.35} />
      <line x1={-halfW} y1={floor2} x2={halfW} y2={floor2} stroke="var(--lfp-cobalt)" strokeWidth={1} opacity={0.35} />

      {/* Upper windows, two storeys, aligned to the same bays as the arches. */}
      {[floor2, floor1].map((fy) =>
        bays.map((bx) => (
          <rect
            key={`${fy}-${bx}`}
            x={bx - 5}
            y={fy - 13}
            width={10}
            height={12}
            rx={1}
            fill="var(--lfp-cobalt)"
            opacity={0.55}
          />
        ))
      )}

      {/* Ground-floor arcade: round arches on piers, the signature of the
          Pombaline street level where the shops were. Open (cal ground)
          rather than solid, so the building has depth instead of weight. */}
      {bays.map((bx) => (
        <path
          key={`arch-${bx}`}
          d={`M ${bx - 8} ${groundY} L ${bx - 8} ${archTop} A 8 8 0 0 1 ${bx + 8} ${archTop} L ${bx + 8} ${groundY} Z`}
          fill="var(--lfp-cal)"
          stroke="var(--lfp-cobalt)"
          strokeWidth={1.6}
        />
      ))}
      {/* Shadow inside each arch — one flat shape, the depth cue. */}
      {bays.map((bx) => (
        <path
          key={`shade-${bx}`}
          d={`M ${bx - 8} ${groundY} L ${bx - 8} ${archTop} A 8 8 0 0 1 ${bx} ${archTop - 8} L ${bx} ${groundY} Z`}
          fill="var(--lfp-cobalt)"
          opacity={0.13}
        />
      ))}

      {/* Pilasters at the corners, tying the storeys together vertically. */}
      {[-halfW + 3, halfW - 3].map((px) => (
        <line key={px} x1={px} y1={corniceY} x2={px} y2={groundY} stroke="var(--lfp-cobalt)" strokeWidth={1} opacity={0.3} />
      ))}

      {/* Cornice: a moulding of two courses, overhanging the facade. */}
      <rect x={-halfW - 7} y={corniceY - 9} width={halfW * 2 + 14} height={6} rx={1} fill="var(--lfp-cobalt)" />
      <rect x={-halfW - 3} y={corniceY - 3} width={halfW * 2 + 6} height={3} fill="var(--lfp-cobalt)" opacity={0.55} />

      {/* Pavement — the calçada the whole Baixa stands on. */}
      <line x1={-halfW - 10} y1={groundY} x2={halfW + 10} y2={groundY} stroke="var(--lfp-cobalt)" strokeWidth={2} />
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

        {/* A lane is lit along its upper edge and shaded along its lower one
            — what turns a flat stroke into a ribbon with a surface.
            `objectBoundingBox` (the default) maps the gradient to each
            path's own box, so on a lane that runs mostly sideways the ramp
            comes out as vertical banding instead of a top light. Anchoring
            it to the STAGE in user space makes the light come from one
            place for every lane, which is what a real light does. */}
        <linearGradient
          id={`lfp-sheen-${uid}`}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={stage.height}
        >
          <stop offset="0%" stopColor="var(--lfp-cal-tile)" stopOpacity={0.5} />
          <stop offset="50%" stopColor="var(--lfp-cal-tile)" stopOpacity={0.05} />
          <stop offset="100%" stopColor="var(--lfp-cobalt-deep)" stopOpacity={0.18} />
        </linearGradient>
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
                strokeLinecap="butt"
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
              {/* Surface: highlight above, shade below. Clipped to the band
                  by reusing the same path and stroke width. */}
              <motion.path
                d={lane.d}
                fill="none"
                stroke={`url(#lfp-sheen-${uid})`}
                strokeLinecap="butt"
                initial={false}
                animate={{ strokeWidth: active ? lane.width * 1.15 : lane.width, opacity: dimmed ? 0.2 : 1 }}
                transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
                style={{ pointerEvents: "none" }}
              />
              {/* A thin travelling line along the lane's spine. It was a
                  band 45% of the lane's width, which on a thick lane drew
                  20px slabs that read as tally marks rather than movement;
                  a hairline reads as current in the channel. */}
              <path
                className="lfp-lane-rigging"
                d={lane.d}
                strokeWidth={Math.max(1, Math.min(lane.width * 0.12, 3))}
                strokeDasharray="3 13"
                opacity={dimmed ? 0.12 : 0.42}
              />
              {/* Terminus: an arrowhead the width of its own lane, turned to
                  face the pole. Without it a thick band stops in mid-air
                  and the eye never sees the money arrive. */}
              <path
                d={`M 0 ${-lane.width / 2} L ${Math.min(lane.width * 0.5, 14)} 0 L 0 ${lane.width / 2} Z`}
                transform={`translate(${lane.end.x} ${lane.end.y}) rotate(${lane.end.angle})`}
                fill={`var(--lfp-tone-${stream.tone})`}
                opacity={dimmed ? 0.25 : lane.opacity}
                style={{ pointerEvents: "none" }}
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

      {/* Pole labels. Vertically the wallet now carries notes above its
          body, so the stack above it starts higher — the amount sat on top
          of the notes at the old offset. */}
      <g className="lfp-num" fontSize={13} textAnchor="middle">
        <text
          x={oPos.x}
          y={oPos.y + (stage.layout === "v" ? -78 : 64)}
          fill="var(--lfp-cobalt-deep)"
          fontWeight={600}
        >
          {origin.label}
        </text>
        {showChips && (
          <text
            x={oPos.x}
            y={oPos.y + (stage.layout === "v" ? -60 : 82)}
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
