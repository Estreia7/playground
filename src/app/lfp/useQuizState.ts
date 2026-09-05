"use client";

/* Quiz run lifecycle and the reader's progress, in localStorage.

   Everything stays in the browser — nothing is sent anywhere. Keys are
   namespaced and versioned so a schema change is detected and discarded
   rather than crashing; every read is wrapped (a corrupt value or Safari
   private mode must never take the page down); reads happen after mount,
   never during render, so the server and first client render agree. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  bandFor,
  dayKey,
  isDue,
  optionOrder,
  pickQuestions,
  recordAnswer,
  type Band,
  type QuizMode,
  type QuizQuestion,
  type SeenMap,
} from "./quiz/engine";

const K_PROGRESS = "lfp:progress:v1";
const K_HISTORY = "lfp:quiz:history:v1";
const K_ACTIVE = "lfp:quiz:active:v1";
const HISTORY_CAP = 20;

export interface Progress {
  version: 1;
  activeDays: string[];
  seen: SeenMap;
  best: Partial<Record<QuizMode, { score: number; band: Band; at: number }>>;
}

export interface RunSummary {
  runId: string;
  mode: QuizMode;
  correct: number;
  total: number;
  band: Band;
  at: number;
}

export interface QuizRun {
  version: 1;
  runId: string;
  mode: QuizMode;
  seed: number;
  questionIds: string[];
  optionOrders: Record<string, number[]>;
  /** Keyed by question id; `selected` is the ORIGINAL option index. */
  answers: Record<string, { selected: number; correct: boolean; at: number }>;
  cursor: number;
  startedAt: number;
  finishedAt: number | null;
}

const EMPTY_PROGRESS: Progress = { version: 1, activeDays: [], seen: {}, best: {} };

function safeRead<T>(key: string, fallback: T, version = 1): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    if (v && typeof v === "object" && "version" in v && v.version !== version) return fallback;
    return v as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* preference simply won't persist */
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ── bank (module cache, like the data hooks) ───────────── */

interface BankPayload {
  questions: QuizQuestion[];
  rejected: Array<{ id: string; errors: string[] }>;
}
let bankCache: BankPayload | null = null;
let bankInflight: Promise<BankPayload> | null = null;

function loadBank(): Promise<BankPayload> {
  if (bankCache) return Promise.resolve(bankCache);
  if (!bankInflight) {
    bankInflight = fetch("/api/lfp/quiz")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<BankPayload>;
      })
      .then((p) => {
        bankCache = p;
        bankInflight = null;
        return p;
      })
      .catch((e) => {
        bankInflight = null;
        throw e;
      });
  }
  return bankInflight;
}

/* ── progress (shared by the quiz and the profile page) ─── */

export function useProgress() {
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setProgress(safeRead<Progress>(K_PROGRESS, EMPTY_PROGRESS));
    setHistory(safeRead<{ version: 1; runs: RunSummary[] }>(K_HISTORY, { version: 1, runs: [] }).runs);
    setHydrated(true);
  }, []);

  const update = useCallback((next: Progress) => {
    setProgress(next);
    safeWrite(K_PROGRESS, next);
  }, []);

  const pushHistory = useCallback((run: RunSummary) => {
    setHistory((h) => {
      const next = [run, ...h].slice(0, HISTORY_CAP);
      safeWrite(K_HISTORY, { version: 1, runs: next });
      return next;
    });
  }, []);

  const resetAll = useCallback(() => {
    safeRemove(K_PROGRESS);
    safeRemove(K_HISTORY);
    safeRemove(K_ACTIVE);
    setProgress(EMPTY_PROGRESS);
    setHistory([]);
  }, []);

  return { progress, history, hydrated, update, pushHistory, resetAll };
}

/* ── the quiz ───────────────────────────────────────────── */

export type Phase = "select" | "run" | "result";

export function useQuizState() {
  const [bank, setBank] = useState<QuizQuestion[] | null>(bankCache?.questions ?? null);
  const [loading, setLoading] = useState(!bankCache);
  const [error, setError] = useState<string | null>(null);
  const { progress, history, hydrated, update, pushHistory, resetAll } = useProgress();
  const [run, setRun] = useState<QuizRun | null>(null);
  const [phase, setPhase] = useState<Phase>("select");

  useEffect(() => {
    let alive = true;
    loadBank()
      .then((p) => {
        if (!alive) return;
        setBank(p.questions);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (!alive) return;
        setError(e.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // A half-finished run is offered for resumption, never silently continued.
  const [active, setActive] = useState<QuizRun | null>(null);
  useEffect(() => {
    const a = safeRead<QuizRun | null>(K_ACTIVE, null);
    if (a && a.finishedAt === null) setActive(a);
  }, []);

  const byId = useMemo(() => new Map((bank ?? []).map((q) => [q.id, q])), [bank]);

  const persistRun = useCallback((r: QuizRun | null) => {
    setRun(r);
    if (r) safeWrite(K_ACTIVE, r);
    else safeRemove(K_ACTIVE);
  }, []);

  const start = useCallback(
    (mode: QuizMode, count: number) => {
      if (!bank) return;
      const now = Date.now();
      const seed = (now ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
      const picked = pickQuestions(bank, { mode, count, seed, seen: progress.seen, now });
      if (picked.length === 0) return;
      const optionOrders: Record<string, number[]> = {};
      picked.forEach((q, i) => (optionOrders[q.id] = optionOrder(q.options.pt.length, seed + i)));
      const r: QuizRun = {
        version: 1,
        runId: `${now.toString(36)}-${seed.toString(36)}`,
        mode,
        seed,
        questionIds: picked.map((q) => q.id),
        optionOrders,
        answers: {},
        cursor: 0,
        startedAt: now,
        finishedAt: null,
      };
      setActive(null);
      persistRun(r);
      setPhase("run");
    },
    [bank, progress.seen, persistRun]
  );

  const resume = useCallback(() => {
    if (!active) return;
    persistRun(active);
    setActive(null);
    setPhase("run");
  }, [active, persistRun]);

  const discard = useCallback(() => {
    setActive(null);
    safeRemove(K_ACTIVE);
  }, []);

  const currentQuestion = run && phase === "run" ? byId.get(run.questionIds[run.cursor]) ?? null : null;
  const currentAnswer = run && currentQuestion ? run.answers[currentQuestion.id] : undefined;

  const answer = useCallback(
    (originalIndex: number) => {
      if (!run || !currentQuestion || currentAnswer) return;
      const now = Date.now();
      const correct = originalIndex === currentQuestion.correctIndex;
      const next: QuizRun = {
        ...run,
        answers: { ...run.answers, [currentQuestion.id]: { selected: originalIndex, correct, at: now } },
      };
      persistRun(next);
      // Progress updates per answer, so abandoning a run still counts.
      const day = dayKey(now);
      update({
        ...progress,
        activeDays: progress.activeDays.includes(day) ? progress.activeDays : [...progress.activeDays, day],
        seen: recordAnswer(progress.seen, currentQuestion.id, correct, now),
      });
    },
    [run, currentQuestion, currentAnswer, persistRun, update, progress]
  );

  const next = useCallback(() => {
    if (!run) return;
    if (run.cursor + 1 < run.questionIds.length) {
      persistRun({ ...run, cursor: run.cursor + 1 });
      return;
    }
    // Finish.
    const now = Date.now();
    const total = run.questionIds.length;
    const correct = run.questionIds.filter((id) => run.answers[id]?.correct).length;
    const band = bandFor(total ? correct / total : 0);
    const finished: QuizRun = { ...run, finishedAt: now };
    setRun(finished);
    safeRemove(K_ACTIVE);
    pushHistory({ runId: run.runId, mode: run.mode, correct, total, band, at: now });
    const prevBest = progress.best[run.mode];
    const score = total ? correct / total : 0;
    if (!prevBest || score > prevBest.score) {
      update({ ...progress, best: { ...progress.best, [run.mode]: { score, band, at: now } } });
    }
    setPhase("result");
  }, [run, persistRun, pushHistory, progress, update]);

  const reset = useCallback(() => {
    setRun(null);
    setPhase("select");
  }, []);

  const dueCount = useMemo(() => {
    if (!bank) return {} as Record<QuizMode, number>;
    const now = Date.now();
    const out: Record<string, number> = { geral: 0 };
    for (const q of bank) {
      const due = isDue(progress.seen[q.id], now) ? 1 : 0;
      out[q.category] = (out[q.category] ?? 0) + due;
      out.geral += due;
    }
    return out as Record<QuizMode, number>;
  }, [bank, progress.seen]);

  return {
    bank,
    byId,
    loading,
    error,
    hydrated,
    phase,
    run,
    active,
    currentQuestion,
    currentAnswer,
    progress,
    history,
    dueCount,
    start,
    resume,
    discard,
    answer,
    next,
    reset,
    resetAll,
  };
}
