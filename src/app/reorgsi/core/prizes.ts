/* The recognition programme: six levels, won on what a consultant bills in one
   year. The count starts again every January. */

export interface PrizeLevel {
  key: string;
  label: string;
  min: number;
  /** Drawing in public/reorgsi/prizes/. */
  icon: string;
}

export const PRIZE_LEVELS: PrizeLevel[] = [
  { key: "RUBY", label: "Ruby", min: 55_000, icon: "ruby" },
  { key: "EMERALD", label: "Emerald", min: 82_000, icon: "emerald" },
  { key: "DIAMOND", label: "Diamond", min: 110_000, icon: "diamond" },
  { key: "CENTURION", label: "Centurion", min: 165_000, icon: "centurion" },
  { key: "DOUBLE CENTURION", label: "Double Centurion", min: 330_000, icon: "double-centurion" },
  { key: "GRAND CENTURION", label: "Grand Centurion", min: 500_000, icon: "grand-centurion" },
];

export const prizeIcon = (level: PrizeLevel) => `/reorgsi/prizes/${level.icon}.svg`;

export interface PrizeProgress {
  /** Highest level reached, if any. */
  current: PrizeLevel | null;
  next: PrizeLevel | null;
  /** Still to bill for the next level. */
  missing: number;
  /** Where the bar stands, 0..1. Levels sit at equal distances, like an
   *  experience bar: on a straight scale the first three would crowd together. */
  position: number;
}

export function levelFor(billed: number): PrizeLevel | null {
  return [...PRIZE_LEVELS].reverse().find((l) => billed >= l.min) ?? null;
}

export function prizeProgress(billed: number): PrizeProgress {
  const current = levelFor(billed);
  const reached = current ? PRIZE_LEVELS.indexOf(current) + 1 : 0;
  const next = PRIZE_LEVELS[reached] ?? null;
  if (!next) return { current, next, missing: 0, position: 1 };
  const from = current?.min ?? 0;
  const within = Math.max(0, (billed - from) / (next.min - from));
  return { current, next, missing: Math.round((next.min - billed) * 100) / 100, position: (reached + within) / PRIZE_LEVELS.length };
}
