/* Pure formatting helpers. No React, no DOM.
   Portuguese conventions: 1.234,56 € with a non-breaking space before the symbol. */

import type { Lang } from "./types";

const LOCALE: Record<Lang, string> = { pt: "pt-PT", en: "en-GB" };

// Intl constructors are expensive; cache per (locale, shape).
const cache = new Map<string, Intl.NumberFormat>();

function nf(key: string, locale: string, opts: Intl.NumberFormatOptions) {
  const k = `${key}:${locale}`;
  let f = cache.get(k);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    cache.set(k, f);
  }
  return f;
}

/** €1.234,56 — or €1.235 when cents add nothing (totals, big figures). */
export function eur(value: number, lang: Lang = "pt", decimals = 2): string {
  if (!Number.isFinite(value)) return "—";
  return nf(`eur${decimals}`, LOCALE[lang], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Rounded euros, no cents. For headline figures where cents are noise. */
export function eur0(value: number, lang: Lang = "pt"): string {
  return eur(value, lang, 0);
}

/** 23,5 % — takes a FRACTION (0.235), not a percentage. */
export function pct(fraction: number, lang: Lang = "pt", decimals = 1): string {
  if (!Number.isFinite(fraction)) return "—";
  return nf(`pct${decimals}`, LOCALE[lang], {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(fraction);
}

/** Plain number with thousands separators. */
export function num(value: number, lang: Lang = "pt", decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  return nf(`num${decimals}`, LOCALE[lang], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** "1,4 dias" / "2,3 meses" — unit supplied by the caller from the dictionary. */
export function withUnit(value: number, unit: string, lang: Lang = "pt", decimals = 1): string {
  return `${num(value, lang, decimals)} ${unit}`;
}

/** ISO date → "4 set 2026". Used by SourceBadge and capture dates. */
export function shortDate(iso: string, lang: Lang = "pt"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** For input fields: the locale's decimal separator but NO thousands
 *  grouping — a cursor dropped into "1 500" would pick up the separator on
 *  the next keystroke — and only as many decimals as the value has, up to
 *  `max`. Empty for non-finite, so a field never shows "NaN". */
export function numPlain(value: number, lang: Lang = "pt", max = 2): string {
  if (!Number.isFinite(value)) return "";
  return nf(`plain${max}`, LOCALE[lang], {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  }).format(value);
}

/** Parses what a Portuguese user types into a number field: decimal commas,
 *  stray spaces, a pasted "€". Returns null for anything that isn't a number
 *  yet (empty, lone minus) so the field can hold a half-typed draft. Lives
 *  here rather than in the input component so it is testable without JSX. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s|€/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
