/* Mitos — pure. A claim, a verdict, an explanation with an official source.
   Same contract as the quiz engine: the bank is admin-editable JSON, so a
   validator hides a malformed entry instead of letting it crash the page. */

import type { Lang } from "../types";

export type Verdict = "mito" | "verdade";

export interface Myth {
  id: string;
  verdict: Verdict;
  claim: Record<Lang, string>;
  explanation: Record<Lang, string>;
  source: string;
  learnMore?: string;
}

export interface MythBank {
  meta: { year: number; label: string; source: string; lastVerified: string; version: number; notes?: string[] };
  myths: Myth[];
}

const LANGS: Lang[] = ["pt", "en"];

function isLangText(v: unknown): v is Record<Lang, string> {
  return (
    !!v &&
    typeof v === "object" &&
    LANGS.every((l) => typeof (v as Record<string, unknown>)[l] === "string" && (v as Record<string, string>)[l].trim().length > 0)
  );
}

export function validateMyth(m: unknown): string[] {
  const e: string[] = [];
  if (!m || typeof m !== "object") return ["não é um objeto"];
  const x = m as Partial<Myth> & Record<string, unknown>;
  if (typeof x.id !== "string" || !/^[a-z0-9-]+$/.test(x.id)) e.push("id: obrigatório, só letras minúsculas, dígitos e hífens");
  if (x.verdict !== "mito" && x.verdict !== "verdade") e.push("verdict: mito ou verdade");
  if (!isLangText(x.claim)) e.push("claim: texto obrigatório em pt e en");
  if (!isLangText(x.explanation)) e.push("explanation: texto obrigatório em pt e en");
  if (typeof x.source !== "string" || !/^https:\/\//.test(x.source)) e.push("source: URL https obrigatório");
  if (x.learnMore !== undefined && (typeof x.learnMore !== "string" || !x.learnMore.startsWith("/lfp/"))) e.push("learnMore: tem de começar por /lfp/");
  return e;
}

export interface ValidatedMyths {
  myths: Myth[];
  rejected: Array<{ id: string; errors: string[] }>;
}

export function validateMyths(raw: unknown): ValidatedMyths {
  const myths: Myth[] = [];
  const rejected: ValidatedMyths["rejected"] = [];
  const seen = new Set<string>();
  const list = (raw as { myths?: unknown[] })?.myths;
  if (!Array.isArray(list)) return { myths, rejected: [{ id: "(bank)", errors: ["myths: array obrigatório"] }] };
  list.forEach((m, i) => {
    const errors = validateMyth(m);
    const id = (m as { id?: unknown })?.id;
    const label = typeof id === "string" ? id : `#${i}`;
    if (errors.length === 0 && seen.has(label)) errors.push("id: duplicado");
    if (errors.length) rejected.push({ id: label, errors });
    else {
      seen.add(label);
      myths.push(m as Myth);
    }
  });
  return { myths, rejected };
}
