"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { tr } from "../i18n";
import { seededShuffle } from "../quiz/engine";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import type { Myth, Verdict } from "./engine";

const KEY = "lfp:mitos:v1";

interface Saved {
  /** id → whether the reader got it right, last time. */
  answers: Record<string, boolean>;
}

function safeRead(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { answers: {} };
    const p = JSON.parse(raw) as Partial<Saved>;
    return { answers: p.answers && typeof p.answers === "object" ? p.answers : {} };
  } catch {
    return { answers: {} };
  }
}

function safeWrite(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

export default function MitosView() {
  const { t, lang } = useLfpLang();
  const d = t.sec.mitos;

  const [myths, setMyths] = useState<Myth[] | null>(null);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState<Saved>({ answers: {} });
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Verdict | null>(null);
  const [runScore, setRunScore] = useState(0);

  useEffect(() => {
    setSaved(safeRead());
    fetch("/api/lfp/mitos")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => setMyths(j.myths))
      .catch(() => setError(true));
  }, []);

  const deck = useMemo(() => (myths ? seededShuffle(myths, seed) : []), [myths, seed]);
  const current = deck[cursor] ?? null;
  const total = deck.length;
  const done = myths !== null && cursor >= total;
  const known = Object.values(saved.answers).filter(Boolean).length;

  const answer = (v: Verdict) => {
    if (!current || picked) return;
    setPicked(v);
    const ok = v === current.verdict;
    if (ok) setRunScore((s) => s + 1);
    const next = { answers: { ...saved.answers, [current.id]: ok } };
    setSaved(next);
    safeWrite(next);
  };

  const next = () => {
    setPicked(null);
    setCursor((c) => c + 1);
  };

  const again = () => {
    setSeed(Date.now() % 100000);
    setCursor(0);
    setPicked(null);
    setRunScore(0);
  };

  const btn = "lfp-focus lfp-press flex min-h-14 flex-1 items-center justify-center rounded-lg border-2 px-4 text-base font-semibold transition-colors";

  return (
    <Shell crumbs={[{ href: "/lfp/quiz", label: t.quiz.quiz.crumb }, { label: d.crumb }]}>
      <PageIntro eyebrow={d.eyebrow} title={d.title} lede={d.lede} />

      {myths === null && !error && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {current && !done && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex items-center justify-between text-xs">
            <span className="lfp-eyebrow">{tr(d.counter, { n: cursor + 1, total })}</span>
            {myths && <span className="lfp-eyebrow">{tr(d.known, { n: known, total: myths.length })}</span>}
          </div>
          <div
            role="progressbar"
            aria-label={d.progressAria}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={cursor + (picked ? 1 : 0)}
            className="h-1.5 overflow-hidden rounded-full bg-[var(--lfp-line)]"
          >
            <div className="h-full rounded-full bg-[var(--lfp-cobalt)] transition-[width] duration-300" style={{ width: `${((cursor + (picked ? 1 : 0)) / total) * 100}%` }} />
          </div>

          <blockquote className="lfp-tile p-6 sm:p-8">
            <p className="lfp-eyebrow">{d.claimEyebrow}</p>
            <p className="lfp-display mt-3 text-2xl font-semibold leading-snug sm:text-3xl">«{current.claim[lang]}»</p>
          </blockquote>

          <div className="flex gap-3" role="group" aria-label={d.answerAria}>
            {(["verdade", "mito"] as Verdict[]).map((v) => {
              const isRight = v === current.verdict;
              const isPicked = picked === v;
              let tone = "border-[var(--lfp-line)] hover:border-[var(--lfp-cobalt)]";
              if (picked) {
                if (isRight) tone = "border-[var(--lfp-verde)] bg-[var(--lfp-verde-dim)] text-[var(--lfp-verde)]";
                else if (isPicked) tone = "border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho-dim)] text-[var(--lfp-vermelho)]";
                else tone = "border-[var(--lfp-line)] opacity-60";
              }
              return (
                <button key={v} type="button" onClick={() => answer(v)} disabled={!!picked} aria-pressed={isPicked} className={`${btn} ${tone} disabled:cursor-default`}>
                  {v === "verdade" ? d.verdade : d.mito}
                </button>
              );
            })}
          </div>

          {picked && (
            <div role="status" className="lfp-panel space-y-3 p-5">
              <p className={`lfp-eyebrow ${picked === current.verdict ? "text-[var(--lfp-verde)]" : "text-[var(--lfp-vermelho)]"}`}>
                {picked === current.verdict ? d.right : d.wrong} · {current.verdict === "mito" ? d.isMito : d.isVerdade}
              </p>
              <p className="text-[0.9375rem] leading-relaxed">{current.explanation[lang]}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={current.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lfp-focus inline-flex min-h-11 items-center rounded-md border border-[var(--lfp-line)] px-3 text-xs font-medium text-[var(--lfp-cobalt)] underline underline-offset-2 hover:border-[var(--lfp-cobalt)]"
                >
                  {t.quiz.quiz.source} ↗
                </a>
                {current.learnMore && (
                  <Link href={current.learnMore} className="lfp-focus inline-flex min-h-11 items-center rounded-md border border-[var(--lfp-line)] px-3 text-xs font-medium text-[var(--lfp-cobalt)] hover:border-[var(--lfp-cobalt)]">
                    {t.quiz.quiz.learnMore} →
                  </Link>
                )}
                <button type="button" onClick={next} className="lfp-focus lfp-press ml-auto min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]">
                  {cursor + 1 === total ? d.finish : d.next}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {done && (
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="lfp-panel p-6 text-center sm:text-left">
            <p className="lfp-eyebrow">{d.done.eyebrow}</p>
            <h2 className="lfp-display mt-1 text-3xl font-semibold">{tr(d.done.title, { n: runScore, total })}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{d.done.body}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={again} className="lfp-focus lfp-press min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]">
              {d.again}
            </button>
            <Link href="/lfp/quiz" className="lfp-focus inline-flex min-h-11 items-center rounded-lg border border-[var(--lfp-line)] px-5 text-sm hover:border-[var(--lfp-cobalt)]">
              {d.toQuiz}
            </Link>
          </div>
        </div>
      )}
    </Shell>
  );
}
