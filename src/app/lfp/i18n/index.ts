/* Dictionary assembly.

   Portuguese is canonical: its object shape defines the type, and every
   other language is checked against it. That keeps the property the
   papelaria pattern gives — a missing key won't compile — without a
   hand-maintained type that can drift from the content, and with errors
   that point at the exact file and property instead of a 4000-line monolith. */

import { chromePt } from "./chrome.pt";
import { chromeEn } from "./chrome.en";
import { calcPt } from "./calc.pt";
import { calcEn } from "./calc.en";
import type { Lang } from "../types";

export type { Lang };

const pt = { chrome: chromePt, calc: calcPt };
export type Dict = typeof pt;

// A fragment missing here, or a key missing inside one, fails right here.
const en: Dict = { chrome: chromeEn, calc: calcEn };

export const dictionaries: Record<Lang, Dict> = { pt, en };

export const LANGS: readonly Lang[] = ["pt", "en"];

export function isLang(v: unknown): v is Lang {
  return v === "pt" || v === "en";
}

/** Fills `{name}` slots. Unknown slots are left visible rather than
 *  silently blanked, so a typo shows up in the UI instead of hiding. */
export function tr(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m
  );
}
