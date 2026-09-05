/* Quiz engine — pure. No React, no DOM, no clock (time is passed in).

   The question bank is JSON so it can be edited in the admin, which gives
   up the compile-time guarantee the dictionaries have. This module is the
   replacement: a validator that rejects a malformed question and HIDES it,
   so a bad edit degrades the quiz instead of crashing the page. */

import type { Lang } from "../types";

export const CATEGORIES = ["irs", "tsu", "iva", "irc", "economia"] as const;
export type QuizCategory = (typeof CATEGORIES)[number];
export type QuizMode = QuizCategory | "geral";
export type Difficulty = "basico" | "medio" | "avancado";

export interface QuizQuestion {
  id: string;
  category: QuizCategory;
  difficulty: Difficulty;
  prompt: Record<Lang, string>;
  options: Record<Lang, string[]>;
  correctIndex: number;
  explanation: Record<Lang, string>;
  source: string;
  learnMore?: string;
}

export interface QuizBank {
  meta: { year: number; label: string; source: string; lastVerified: string; version: number; notes?: string[] };
  questions: QuizQuestion[];
}

/* ── validation ─────────────────────────────────────────── */

const LANGS: Lang[] = ["pt", "en"];

function isLangText(v: unknown): v is Record<Lang, string> {
  return (
    !!v &&
    typeof v === "object" &&
    LANGS.every((l) => typeof (v as Record<string, unknown>)[l] === "string" && ((v as Record<string, string>)[l]).trim().length > 0)
  );
}

/** Errors for one question; empty means valid. Every check names its field. */
export function validateQuestion(q: unknown): string[] {
  const e: string[] = [];
  if (!q || typeof q !== "object") return ["não é um objeto"];
  const x = q as Partial<QuizQuestion> & Record<string, unknown>;

  if (typeof x.id !== "string" || !/^[a-z0-9-]+$/.test(x.id)) e.push("id: obrigatório, só letras minúsculas, dígitos e hífens");
  if (!(CATEGORIES as readonly string[]).includes(x.category as string)) e.push(`category: tem de ser uma de ${CATEGORIES.join(", ")}`);
  if (!["basico", "medio", "avancado"].includes(x.difficulty as string)) e.push("difficulty: basico, medio ou avancado");
  if (!isLangText(x.prompt)) e.push("prompt: texto obrigatório em pt e en");
  if (!isLangText(x.explanation)) e.push("explanation: texto obrigatório em pt e en");
  if (typeof x.source !== "string" || !/^https:\/\//.test(x.source)) e.push("source: URL https obrigatório");
  if (x.learnMore !== undefined && (typeof x.learnMore !== "string" || !x.learnMore.startsWith("/lfp/"))) e.push("learnMore: tem de começar por /lfp/");

  const opts = x.options as Record<string, unknown> | undefined;
  let n = -1;
  if (!opts || typeof opts !== "object") {
    e.push("options: obrigatório");
  } else {
    for (const l of LANGS) {
      const arr = opts[l];
      if (!Array.isArray(arr) || arr.length < 2 || !arr.every((s) => typeof s === "string" && s.trim().length > 0)) {
        e.push(`options.${l}: pelo menos 2 opções não vazias`);
      } else if (n === -1) n = arr.length;
      else if (arr.length !== n) e.push("options: pt e en têm de ter o mesmo número de opções");
    }
  }
  if (!Number.isInteger(x.correctIndex) || (x.correctIndex as number) < 0 || (n >= 0 && (x.correctIndex as number) >= n)) {
    e.push("correctIndex: inteiro dentro do número de opções");
  }
  return e;
}

export interface ValidatedBank {
  questions: QuizQuestion[];
  rejected: Array<{ id: string; errors: string[] }>;
}

/** Keeps the valid questions, reports the rest, and refuses duplicate ids
 *  (the second copy is rejected — the first one wins). */
export function validateBank(raw: unknown): ValidatedBank {
  const questions: QuizQuestion[] = [];
  const rejected: ValidatedBank["rejected"] = [];
  const seen = new Set<string>();
  const list = (raw as { questions?: unknown[] })?.questions;
  if (!Array.isArray(list)) return { questions, rejected: [{ id: "(bank)", errors: ["questions: array obrigatório"] }] };

  list.forEach((q, i) => {
    const errors = validateQuestion(q);
    const id = (q as { id?: unknown })?.id;
    const label = typeof id === "string" ? id : `#${i}`;
    if (errors.length === 0 && seen.has(label)) errors.push("id: duplicado");
    if (errors.length) rejected.push({ id: label, errors });
    else {
      seen.add(label);
      questions.push(q as QuizQuestion);
    }
  });
  return { questions, rejected };
}

/* ── selection ──────────────────────────────────────────── */

/** Mulberry32 — small, seedable, good enough for shuffling. Seeded so a run
 *  can be stored and replayed exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  const next = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ── spaced repetition ──────────────────────────────────── */

/** Days until a question comes back, by how many times in a row it has been
 *  answered correctly. A wrong answer resets to the first rung. */
export const LADDER_DAYS = [1, 3, 7, 21] as const;
const DAY_MS = 86_400_000;

export interface SeenEntry {
  attempts: number;
  correct: number;
  /** Consecutive correct answers — the rung on the ladder. */
  streak: number;
  lastSeen: number;
}

export type SeenMap = Record<string, SeenEntry>;

export function recordAnswer(seen: SeenMap, id: string, correct: boolean, now: number): SeenMap {
  const prev = seen[id] ?? { attempts: 0, correct: 0, streak: 0, lastSeen: 0 };
  return {
    ...seen,
    [id]: {
      attempts: prev.attempts + 1,
      correct: prev.correct + (correct ? 1 : 0),
      streak: correct ? prev.streak + 1 : 0,
      lastSeen: now,
    },
  };
}

/** A question is due if never seen, or its ladder interval has elapsed. */
export function isDue(entry: SeenEntry | undefined, now: number): boolean {
  if (!entry) return true;
  const rung = Math.min(entry.streak, LADDER_DAYS.length - 1);
  return now - entry.lastSeen >= LADDER_DAYS[rung] * DAY_MS;
}

export interface PickOptions {
  mode: QuizMode;
  count: number;
  seed: number;
  seen: SeenMap;
  now: number;
}

/** Due questions first (never-seen and lapsed), then the rest — each group
 *  shuffled by the seed, so a run is reproducible from {mode, seed}. */
export function pickQuestions(bank: QuizQuestion[], opts: PickOptions): QuizQuestion[] {
  const pool = opts.mode === "geral" ? bank : bank.filter((q) => q.category === opts.mode);
  const due = pool.filter((q) => isDue(opts.seen[q.id], opts.now));
  const rest = pool.filter((q) => !isDue(opts.seen[q.id], opts.now));
  const ordered = [...seededShuffle(due, opts.seed), ...seededShuffle(rest, opts.seed ^ 0x9e3779b9)];
  return ordered.slice(0, Math.max(0, opts.count));
}

/** Option order per question, so the right answer is not always in the same
 *  slot; the run stores this so a replay shows the same layout. */
export function optionOrder(n: number, seed: number): number[] {
  return seededShuffle(Array.from({ length: n }, (_, i) => i), seed);
}

/* ── scoring ────────────────────────────────────────────── */

export type Band = "grumete" | "marinheiro" | "piloto" | "capitao" | "navegador";

/** Thresholds are lower bounds on the score fraction. */
export const BANDS: Array<{ band: Band; min: number }> = [
  { band: "navegador", min: 0.95 },
  { band: "capitao", min: 0.8 },
  { band: "piloto", min: 0.6 },
  { band: "marinheiro", min: 0.35 },
  { band: "grumete", min: 0 },
];

export function bandFor(score: number): Band {
  const s = Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
  return BANDS.find((b) => s >= b.min)!.band;
}

/* ── streak of days ─────────────────────────────────────── */

/** ISO date (local) for a timestamp — the unit of the daily streak. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Consecutive active days ending today or yesterday. A gap of one day
 *  (yesterday active, today not yet) keeps the streak alive. */
export function dayStreak(activeDays: string[], now: number): number {
  const set = new Set(activeDays);
  let cursor = now;
  if (!set.has(dayKey(cursor))) {
    cursor -= DAY_MS;
    if (!set.has(dayKey(cursor))) return 0;
  }
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n++;
    cursor -= DAY_MS;
  }
  return n;
}
