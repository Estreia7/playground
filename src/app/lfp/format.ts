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
