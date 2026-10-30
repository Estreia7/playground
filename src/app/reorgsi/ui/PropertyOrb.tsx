"use client";

import { useEffect, useRef } from "react";
import { GLYPHS } from "./Icons.tsx";

/* The intro's orb: the business drawn as a small solar system.

   A dotted sphere turns at the centre — the organisation. Around it, on
   three tilted orbits, ride houses, people and keys. Every so often a key
   leaves a person and arcs to a house; when it lands the house pulses and a
   burst of coins falls into the core. Coins also stream in from the edge
   (commission in, jade) and out from the core (payouts, muted teal), and the
   traffic thickens as the intro runs, so the five seconds build to a close.

   Plain 2D canvas, device pixel ratio capped at 2. With reduced motion it
   paints one still frame. */

type Glyph = keyof typeof GLYPHS;

interface Orbiter {
  glyph: Glyph;
  ring: number;
  phase: number;
}

interface Ring {
  radius: number;
  tilt: number; // rotation of the ellipse in the screen plane
  squash: number; // ry / rx
  speed: number; // radians per second
}

interface Coin {
  from: [number, number];
  to: [number, number];
  t0: number;
  dur: number;
  inbound: boolean;
}

interface Hop {
  fromIdx: number;
  toIdx: number;
  t0: number;
  dur: number;
}

const JADE = "212,236,221";
const TEAL = "120,170,176";
const OUT = "111,154,160";

const RINGS: Ring[] = [
  { radius: 1.42, tilt: -0.42, squash: 0.34, speed: 0.42 },
  { radius: 1.7, tilt: 0.36, squash: 0.28, speed: -0.3 },
  { radius: 1.98, tilt: -0.12, squash: 0.22, speed: 0.22 },
];

const ORBITERS: Orbiter[] = [
  { glyph: "house", ring: 0, phase: 0 },
  { glyph: "house", ring: 0, phase: 2.1 },
  { glyph: "house", ring: 0, phase: 4.2 },
  { glyph: "person", ring: 1, phase: 0.6 },
  { glyph: "person", ring: 1, phase: 2.7 },
  { glyph: "person", ring: 1, phase: 4.8 },
  { glyph: "key", ring: 2, phase: 1.4 },
  { glyph: "coin", ring: 2, phase: 3.3 },
  { glyph: "house", ring: 2, phase: 5.2 },
];

const PATHS: Partial<Record<Glyph, Path2D>> = {};
function glyphPath(g: Glyph): Path2D {
  return (PATHS[g] ??= new Path2D(GLYPHS[g]));
}

/** Points spread evenly over a sphere (golden spiral). */
function spherePoints(n: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * golden;
    pts.push([Math.cos(a) * r, y, Math.sin(a) * r]);
  }
  return pts;
}

export function PropertyOrb({ size, durationMs }: { size: number; durationMs: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.2; // sphere radius; orbits are multiples of it
    const U = Math.max(1, size / 300); // glyphs and coins grow with the orb
    const dots = spherePoints(size < 300 ? 260 : 380);
    const coins: Coin[] = [];
    const hops: Hop[] = [];
    const pulses = new Map<number, number>(); // orbiter index → time of pulse
    let nextCoin = 0;
    let nextHop = 600;
    let raf = 0;
    const start = performance.now();

    const orbitPos = (o: Orbiter, t: number): { x: number; y: number; z: number } => {
      const ring = RINGS[o.ring];
      const a = o.phase + ring.speed * t;
      const ex = Math.cos(a) * R * ring.radius;
      const ey = Math.sin(a) * R * ring.radius * ring.squash;
      const cos = Math.cos(ring.tilt);
      const sin = Math.sin(ring.tilt);
      // z > 0 is in front of the sphere: the lower half of each ellipse.
      return { x: cx + ex * cos - ey * sin, y: cy + ex * sin + ey * cos, z: Math.sin(a) };
    };

    const drawGlyph = (g: Glyph, x: number, y: number, baseScale: number, alpha: number, pulse = 0) => {
      const scale = baseScale * U;
      ctx.save();
      ctx.translate(x, y);
      if (pulse > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, 14 * scale * (1 + pulse * 0.9), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${JADE},${0.55 * (1 - pulse)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // A dark disc behind each glyph keeps it legible over the dots.
      ctx.beginPath();
      ctx.arc(0, 0, 13 * scale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(17,32,49,${0.86 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(${TEAL},${0.5 * alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.scale(scale * 0.78, scale * 0.78);
      ctx.translate(-12, -12);
      ctx.strokeStyle = `rgba(${JADE},${alpha})`;
      ctx.lineWidth = 1.8;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(glyphPath(g));
      ctx.restore();
    };

    const drawCoin = (x: number, y: number, radius: number, color: string, alpha: number) => {
      const r = radius * U;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${alpha})`;
      ctx.fill();
      if (r > 3.2) {
        ctx.fillStyle = `rgba(17,32,49,${alpha * 0.9})`;
        ctx.font = `700 ${r * 1.25}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("€", x, y + r * 0.05);
      }
    };

    const spawnCoin = (now: number, inbound: boolean, from?: [number, number]) => {
      const a = Math.random() * Math.PI * 2;
      const edge: [number, number] = [cx + Math.cos(a) * size * 0.49, cy + Math.sin(a) * size * 0.49];
      const core: [number, number] = [cx + (Math.random() - 0.5) * R * 0.3, cy + (Math.random() - 0.5) * R * 0.3];
      coins.push({
        from: from ?? (inbound ? edge : core),
        to: inbound ? core : edge,
        t0: now,
        dur: 900 + Math.random() * 700,
        inbound,
      });
    };

    const frame = (now: number) => {
      const elapsed = now - start;
      const t = elapsed / 1000;
      const progress = Math.min(1, elapsed / durationMs);
      ctx.clearRect(0, 0, size, size);

      // Faint glow at the core.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.3);
      glow.addColorStop(0, `rgba(52,91,99,${0.55 + 0.25 * progress})`);
      glow.addColorStop(1, "rgba(52,91,99,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      // Orbit lines.
      for (const ring of RINGS) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, R * ring.radius, R * ring.radius * ring.squash, ring.tilt, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${TEAL},0.18)`;
        ctx.setLineDash([2, 6]);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const positions = ORBITERS.map((o) => orbitPos(o, t));

      // Behind the sphere first, dimmer and smaller.
      ORBITERS.forEach((o, i) => {
        const p = positions[i];
        if (p.z < 0) drawGlyph(o.glyph, p.x, p.y, 0.72 + 0.12 * (p.z + 1), 0.45 + 0.25 * (p.z + 1));
      });

      // The sphere: rotate about Y, tilt about X, shade by depth.
      const ay = t * 0.55;
      const ax = -0.38;
      const sy = Math.sin(ay);
      const cyR = Math.cos(ay);
      const sx = Math.sin(ax);
      const cxR = Math.cos(ax);
      const breathe = 1 + Math.sin(t * 2.2) * 0.015 + progress * 0.04;
      for (const [x0, y0, z0] of dots) {
        const x1 = x0 * cyR + z0 * sy;
        const z1 = -x0 * sy + z0 * cyR;
        const y2 = y0 * cxR - z1 * sx;
        const z2 = y0 * sx + z1 * cxR;
        const depth = (z2 + 1) / 2;
        ctx.beginPath();
        ctx.arc(cx + x1 * R * breathe, cy + y2 * R * breathe, 0.5 + depth * 1.25, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${JADE},${0.12 + depth * 0.78})`;
        ctx.fill();
      }

      // Coins in flight.
      if (!reduced) {
        const rate = 340 - progress * 230; // ms between coins, faster as it builds
        if (elapsed > nextCoin) {
          spawnCoin(now, Math.random() < 0.62);
          nextCoin = elapsed + rate * (0.6 + Math.random() * 0.8);
        }
        // A deal: a key leaves a person for a house.
        if (elapsed > nextHop) {
          const people = ORBITERS.map((o, i) => (o.glyph === "person" ? i : -1)).filter((i) => i >= 0);
          const houses = ORBITERS.map((o, i) => (o.glyph === "house" ? i : -1)).filter((i) => i >= 0);
          hops.push({
            fromIdx: people[Math.floor(Math.random() * people.length)],
            toIdx: houses[Math.floor(Math.random() * houses.length)],
            t0: now,
            dur: 850,
          });
          nextHop = elapsed + 1150 - progress * 450;
        }
      }

      for (let i = coins.length - 1; i >= 0; i--) {
        const c = coins[i];
        const k = (now - c.t0) / c.dur;
        if (k >= 1) {
          coins.splice(i, 1);
          continue;
        }
        const e = c.inbound ? k * k : 1 - (1 - k) * (1 - k);
        const x = c.from[0] + (c.to[0] - c.from[0]) * e;
        const y = c.from[1] + (c.to[1] - c.from[1]) * e;
        const fade = c.inbound ? Math.min(1, (1 - k) * 3) : Math.min(1, k * 4) * (1 - k);
        drawCoin(x, y, c.inbound ? 4.6 - 2 * k : 2.6 + 2 * k, c.inbound ? JADE : OUT, fade * 0.95);
      }

      for (let i = hops.length - 1; i >= 0; i--) {
        const h = hops[i];
        const k = (now - h.t0) / h.dur;
        const a = positions[h.fromIdx];
        const b = positions[h.toIdx];
        if (k >= 1) {
          hops.splice(i, 1);
          pulses.set(h.toIdx, now);
          for (let n = 0; n < 4; n++) spawnCoin(now, true, [b.x + (n - 1.5) * 4, b.y]);
          continue;
        }
        // Arc over the sphere rather than through it.
        const mx = (a.x + b.x) / 2;
        const my = Math.min(a.y, b.y) - R * 1.1;
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const x = (1 - e) * (1 - e) * a.x + 2 * (1 - e) * e * mx + e * e * b.x;
        const y = (1 - e) * (1 - e) * a.y + 2 * (1 - e) * e * my + e * e * b.y;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = `rgba(${JADE},${0.14 * (1 - k)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        drawGlyph("key", x, y, 0.62, 1);
      }

      // In front of the sphere.
      ORBITERS.forEach((o, i) => {
        const p = positions[i];
        if (p.z >= 0) {
          const pulseAt = pulses.get(i);
          const pulse = pulseAt != null ? Math.min(1, (now - pulseAt) / 600) : 0;
          if (pulse >= 1) pulses.delete(i);
          drawGlyph(o.glyph, p.x, p.y, 0.84 + 0.16 * p.z, 0.75 + 0.25 * p.z, pulse > 0 && pulse < 1 ? pulse : 0);
        }
      });

      if (!reduced) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [size, durationMs]);

  return <canvas ref={ref} style={{ width: size, height: size }} role="img" aria-label="Casas, chaves, pessoas e comissões em movimento" />;
}
