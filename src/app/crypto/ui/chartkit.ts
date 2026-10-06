"use client";

import { useEffect, useState, type RefObject } from "react";

/* Small helpers for the hand-drawn SVG charts. */

export function useWidth(ref: RefObject<HTMLElement | null>, fallback = 800): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0].contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

export interface Scale {
  (v: number): number;
  invert(px: number): number;
}

export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => r0 + (v - d0) * k) as Scale;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  return f;
}

export function log(d0: number, d1: number, r0: number, r1: number): Scale {
  const l0 = Math.log10(Math.max(d0, 1e-12));
  const l1 = Math.log10(Math.max(d1, 1e-12));
  const inner = linear(l0, l1, r0, r1);
  const f = ((v: number) => inner(Math.log10(Math.max(v, 1e-12)))) as Scale;
  f.invert = (px: number) => 10 ** inner.invert(px);
  return f;
}

/** Ticks on a log axis: 1-2-5 steps per decade, thinned to about `count`. */
export function logTicks(min: number, max: number, count = 6): number[] {
  if (!(min > 0) || !(max > min)) return [];
  const steps = [1, 2, 5];
  const out: number[] = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    for (const s of steps) {
      const v = s * 10 ** e;
      if (v >= min && v <= max) out.push(v);
    }
  }
  if (out.length <= count) return out;
  // Too many: keep decades only, then every other decade.
  const decades = out.filter((v) => Math.abs(Math.log10(v) - Math.round(Math.log10(v))) < 1e-9);
  if (decades.length <= count) return decades;
  const every = Math.ceil(decades.length / count);
  return decades.filter((_, i) => i % every === 0);
}

/** Yearly ticks between two unix-second times, thinned to about `count`. */
export function yearTicks(t0: number, t1: number, count = 8): number[] {
  const y0 = new Date(t0 * 1000).getUTCFullYear();
  const y1 = new Date(t1 * 1000).getUTCFullYear();
  const years: number[] = [];
  for (let y = y0; y <= y1 + 1; y++) {
    const t = Date.UTC(y, 0, 1) / 1000;
    if (t >= t0 && t <= t1) years.push(t);
  }
  if (years.length >= 2) {
    const every = Math.max(1, Math.ceil(years.length / count));
    return years.filter((_, i) => i % every === 0);
  }
  // Under two years in view: months instead.
  const out: number[] = [];
  const d = new Date(t0 * 1000);
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1;
  for (;;) {
    if (m > 11) {
      m = 0;
      y++;
    }
    const t = Date.UTC(y, m, 1) / 1000;
    if (t > t1) break;
    out.push(t);
    m++;
  }
  const every = Math.max(1, Math.ceil(out.length / count));
  return out.filter((_, i) => i % every === 0);
}

export function shortPrice(v: number): string {
  if (v >= 1e6) return "$" + +(v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return "$" + +(v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + "K";
  if (v >= 1) return "$" + (v >= 10 ? v.toFixed(0) : v.toFixed(2));
  if (v >= 0.01) return "$" + v.toFixed(3);
  return "$" + v.toPrecision(2);
}

/** Index of the point with the nearest x (points sorted by x). */
export function nearest<T>(points: T[], x: number, get: (p: T) => number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (get(points[mid]) < x) lo = mid;
    else hi = mid;
  }
  return Math.abs(get(points[lo]) - x) <= Math.abs(get(points[hi]) - x) ? lo : hi;
}
