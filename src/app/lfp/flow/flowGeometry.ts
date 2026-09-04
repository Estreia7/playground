/* Pure geometry for MoneyFlow. No React, no DOM, no randomness.
   Everything here is deterministic so SSR and client agree and hydration
   never mismatches — particle timings are seeded from the stream id. */

import type { FlowStream } from "../types";

export type FlowLayout = "h" | "v";

export interface StageBox {
  width: number;
  height: number;
  layout: FlowLayout;
}

export const STAGE_H: StageBox = { width: 960, height: 340, layout: "h" };
export const STAGE_V: StageBox = { width: 360, height: 440, layout: "v" };

export interface LaneGeometry {
  id: string;
  /** Cubic Bézier path from origin pole to destination pole. */
  d: string;
  /** Stroke width in viewBox units, proportional to share. */
  width: number;
  opacity: number;
  /** amount / baseline, 0..1 */
  share: number;
  /** Where the amount chip sits. */
  midpoint: { x: number; y: number };
  particleCount: number;
  /** Phase offsets 0..1, deterministic. */
  particleDelays: number[];
  /** Control points, kept so particles can be positioned along the curve. */
  curve: Cubic;
}

export interface Cubic {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  x3: number;
  y3: number;
}

export interface ComputeLanesOptions {
  baseline?: number;
  stage?: StageBox;
  maxLaneWidth?: number;
  minLaneWidth?: number;
}

/** Deterministic 0..1 hash of a string. Replaces Math.random() so the
 *  server and the client produce identical particle phases. */
function seed01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // >>> 0 makes it unsigned; divide into 0..1
  return ((h >>> 0) % 10000) / 10000;
}

export function pointOnCubic(c: Cubic, t: number): { x: number; y: number } {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const cc = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * c.x0 + b * c.x1 + cc * c.x2 + d * c.x3,
    y: a * c.y0 + b * c.y1 + cc * c.y2 + d * c.y3,
  };
}

function cubicPath(c: Cubic): string {
  return `M ${c.x0} ${c.y0} C ${c.x1} ${c.y1}, ${c.x2} ${c.y2}, ${c.x3} ${c.y3}`;
}

/** Half-extent of a pole glyph, so lanes can stop at its edge instead of
 *  running through the middle of it. */
export const POLE_RADIUS = 58;

/** Where the poles sit inside the stage, in viewBox units.
 *  A third anchor — `source` — is the point the money leaves from: the gross
 *  salary enters at the centre and splits toward the two poles. */
export function poleAnchors(stage: StageBox) {
  if (stage.layout === "v") {
    return {
      origin: { x: stage.width / 2, y: 92 },
      destination: { x: stage.width / 2, y: stage.height - 92 },
      span: stage.height - 184,
    };
  }
  return {
    origin: { x: 132, y: stage.height / 2 },
    destination: { x: stage.width - 132, y: stage.height / 2 },
    span: stage.width - 264,
  };
}

/**
 * Lane width is DATA — it is proportional to each stream's share of the
 * baseline. A floor keeps tiny streams visible and clickable; the numeric
 * chip beside the lane always carries the exact figure, so the floor can
 * never turn into a lie.
 */
export function computeLanes(
  streams: FlowStream[],
  opts: ComputeLanesOptions = {}
): LaneGeometry[] {
  const stage = opts.stage ?? STAGE_H;
  const maxLaneWidth = opts.maxLaneWidth ?? (stage.layout === "v" ? 40 : 52);
  const minLaneWidth = opts.minLaneWidth ?? 3;

  const total = streams.reduce((s, x) => s + Math.max(0, x.amount), 0);
  const baseline = opts.baseline && opts.baseline > 0 ? opts.baseline : total;
  if (baseline <= 0 || streams.length === 0) return [];

  const { origin, destination } = poleAnchors(stage);
  const vertical = stage.layout === "v";

  // The split point: gross pay arrives at the centre and divides from there.
  const hub = vertical
    ? { x: stage.width / 2, y: stage.height / 2 }
    : { x: stage.width / 2, y: stage.height / 2 };

  // Lanes going the same way fan out among themselves, so each direction is
  // symmetric about the axis instead of the whole set leaning one way.
  const byDirection = { toPeople: [] as FlowStream[], toState: [] as FlowStream[] };
  streams.forEach((s) => byDirection[s.direction].push(s));

  const perpExtent = vertical ? stage.width * 0.3 : stage.height * 0.3;

  return streams.map((s) => {
    const share = Math.max(0, s.amount) / baseline;
    const siblings = byDirection[s.direction];
    const i = siblings.indexOf(s);
    const n = siblings.length;
    const spread = n > 1 ? (perpExtent * 2) / (n - 1) : 0;
    const offset = n > 1 ? (i - (n - 1) / 2) * spread : 0;

    // "Fica contigo" travels to the wallet; taxes travel to the State.
    const pole = s.direction === "toPeople" ? origin : destination;

    let curve: Cubic;
    if (vertical) {
      // Stop at the pole's edge rather than its centre.
      const endY = pole.y + (s.direction === "toPeople" ? POLE_RADIUS * 0.8 : -POLE_RADIUS * 0.8);
      curve = {
        x0: hub.x,
        y0: hub.y,
        x1: hub.x + offset * 0.6,
        y1: hub.y + (endY - hub.y) * 0.4,
        x2: pole.x + offset * 0.35,
        y2: hub.y + (endY - hub.y) * 0.75,
        x3: pole.x,
        y3: endY,
      };
    } else {
      const endX = pole.x + (s.direction === "toPeople" ? POLE_RADIUS : -POLE_RADIUS);
      curve = {
        x0: hub.x,
        y0: hub.y,
        x1: hub.x + (endX - hub.x) * 0.35,
        y1: hub.y + offset * 0.85,
        x2: hub.x + (endX - hub.x) * 0.72,
        y2: pole.y + offset * 0.5,
        x3: endX,
        y3: pole.y + offset * 0.18,
      };
    }

    const width = Math.max(minLaneWidth, Math.min(share * maxLaneWidth, maxLaneWidth));
    const particleCount = Math.max(2, Math.min(Math.round(share * 12), 12));

    // Even stagger plus a deterministic per-stream jitter, so lanes don't
    // pulse in lockstep but still render identically on server and client.
    const jitter = seed01(s.id);
    const particleDelays = Array.from(
      { length: particleCount },
      (_, k) => (k / particleCount + jitter) % 1
    );

    return {
      id: s.id,
      d: cubicPath(curve),
      width,
      opacity: 0.9,
      share,
      midpoint: pointOnCubic(curve, 0.55),
      particleCount,
      particleDelays,
      curve,
    };
  });
}

/** Sum helper used by callers to derive a baseline. */
export function sumAmounts(streams: FlowStream[]): number {
  return streams.reduce((s, x) => s + Math.max(0, x.amount), 0);
}
