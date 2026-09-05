"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { tr } from "../i18n";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import { useQuizState } from "../useQuizState";
import { bandFor, CATEGORIES, type QuizMode } from "./engine";

const MODES: QuizMode[] = ["geral", ...CATEGORIES];
const COUNT: Record<"geral" | "category", number> = { geral: 12, category: 8 };

export default function QuizApp() {
  const q = useQuizState();
  const { t, lang } = useLfpLang();
  const d = t.quiz.quiz;

  return (
    <Shell crumbs={[{ label: d.crumb }]}>
      {q.phase === "select" && <PageIntro eyebrow={d.eyebrow} title={d.title} lede={d.lede} />}

      {q.loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {q.error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{d.loadError}</p>}

      {q.bank && q.phase === "select" && (
        <div className="space-y-6">
          {q.active && (
            <div className="lfp-tile flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <p className="lfp-eyebrow">{d.resumeTitle}</p>
                <p className="mt-1 text-sm">
                  {tr(d.resumeBody, {
                    mode: d.modes[q.active.mode],
                    n: q.active.cursor + 1,
                    total: q.active.questionIds.length,
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={q.discard} className="lfp-focus lfp-press min-h-11 rounded-lg border border-[var(--lfp-line)] px-4 text-sm text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]">
                  {d.discard}
                </button>
                <button type="button" onClick={q.resume} className="lfp-focus lfp-press min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-4 text-sm font-semibold text-[var(--lfp-cal-tile)]">
                  {d.resume}
                </button>
              </div>
            </div>
          )}

          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODES.map((mode) => {
              const pool = mode === "geral" ? q.bank!.length : q.bank!.filter((x) => x.category === mode).length;
              const count = Math.min(pool, mode === "geral" ? COUNT.geral : COUNT.category);
              const due = q.hydrated ? q.dueCount[mode] ?? 0 : 0;
              return (
                <li key={mode}>
                  <button
                    type="button"
                    onClick={() => q.start(mode, count)}
                    disabled={pool === 0}
                    className="lfp-tile lfp-focus lfp-press flex h-full w-full flex-col items-start p-6 text-left transition-colors hover:border-[var(--lfp-cobalt)] disabled:opacity-50"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="lfp-eyebrow">{tr(d.available, { n: pool })}</span>
                      {due > 0 && (
                        <span className="lfp-num rounded-full border border-[var(--lfp-ouro)] px-2 py-0.5 text-[0.6875rem] font-semibold text-[var(--lfp-ouro)]">
                          {tr(d.due, { n: due })}
                        </span>
                      )}
                    </span>
                    <span className="lfp-display mt-2 text-2xl font-semibold">{d.modes[mode]}</span>
                    <span className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{d.modeBodies[mode]}</span>
                    <span className="lfp-num mt-4 text-sm font-semibold text-[var(--lfp-cobalt)]">{d.start} →</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {q.phase === "run" && q.run && q.currentQuestion && (
        <RunView q={q} lang={lang} />
      )}

      {q.phase === "result" && q.run && <ResultView q={q} lang={lang} />}
    </Shell>
  );
}

/* ── one question ───────────────────────────────────────── */

function RunView({ q, lang }: { q: ReturnType<typeof useQuizState>; lang: "pt" | "en" }) {
  const { t } = useLfpLang();
  const d = t.quiz.quiz;
  const run = q.run!;
  const question = q.currentQuestion!;
  const answered = q.currentAnswer;
  const order = run.optionOrders[question.id] ?? question.options[lang].map((_, i) => i);
  const n = run.cursor + 1;
  const total = run.questionIds.length;
  const isLast = n === total;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <div className="flex items-center justify-between text-xs">
          <span className="lfp-eyebrow">{tr(d.progress, { n, total })}</span>
          <span className="lfp-eyebrow">
            {d.modes[run.mode]} · {d.difficulty[question.difficulty]}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={d.progressAria}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={n - 1 + (answered ? 1 : 0)}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--lfp-line)]"
        >
          <div
            className="h-full rounded-full bg-[var(--lfp-cobalt)] transition-[width] duration-300"
            style={{ width: `${((n - 1 + (answered ? 1 : 0)) / total) * 100}%` }}
          />
        </div>
      </div>

      <h2 className="lfp-display text-2xl font-semibold sm:text-3xl">{question.prompt[lang]}</h2>

      <ul className="space-y-2">
        {order.map((originalIndex) => {
          const label = question.options[lang][originalIndex];
          const isCorrect = originalIndex === question.correctIndex;
          const isChosen = answered?.selected === originalIndex;
          let tone = "border-[var(--lfp-line)] hover:border-[var(--lfp-cobalt)]";
          if (answered) {
            if (isCorrect) tone = "border-[var(--lfp-verde)] bg-[var(--lfp-verde-dim)]";
            else if (isChosen) tone = "border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho-dim)]";
            else tone = "border-[var(--lfp-line)] opacity-60";
          }
          return (
            <li key={originalIndex}>
              <button
                type="button"
                onClick={() => q.answer(originalIndex)}
                disabled={!!answered}
                aria-pressed={isChosen}
                className={`lfp-focus lfp-press flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left text-[0.9375rem] leading-relaxed transition-colors ${tone} disabled:cursor-default`}
              >
                <span
                  aria-hidden="true"
                  className={`lfp-num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${
                    answered && isCorrect
                      ? "border-[var(--lfp-verde)] bg-[var(--lfp-verde)] text-[var(--lfp-cal-tile)]"
                      : answered && isChosen
                        ? "border-[var(--lfp-vermelho)] bg-[var(--lfp-vermelho)] text-[var(--lfp-cal-tile)]"
                        : "border-[var(--lfp-line-strong)]"
                  }`}
                >
                  {answered && isCorrect ? "✓" : answered && isChosen ? "✕" : ""}
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {answered && (
        <div role="status" className="lfp-panel space-y-3 p-5">
          <p className={`lfp-eyebrow ${answered.correct ? "text-[var(--lfp-verde)]" : "text-[var(--lfp-vermelho)]"}`}>
            {answered.correct ? d.correct : d.wrong}
          </p>
          {!answered.correct && (
            <p className="text-sm">
              <span className="text-[var(--lfp-mist)]">{d.correctWas}</span>{" "}
              <span className="font-semibold">{question.options[lang][question.correctIndex]}</span>
            </p>
          )}
          <p className="text-[0.9375rem] leading-relaxed">{question.explanation[lang]}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <a
              href={question.source}
              target="_blank"
              rel="noopener noreferrer"
              className="lfp-focus inline-flex min-h-11 items-center rounded-md border border-[var(--lfp-line)] px-3 text-xs font-medium text-[var(--lfp-cobalt)] underline underline-offset-2 hover:border-[var(--lfp-cobalt)]"
            >
              {d.source} ↗
            </a>
            {question.learnMore && (
              <Link
                href={question.learnMore}
                className="lfp-focus inline-flex min-h-11 items-center rounded-md border border-[var(--lfp-line)] px-3 text-xs font-medium text-[var(--lfp-cobalt)] hover:border-[var(--lfp-cobalt)]"
              >
                {d.learnMore} →
              </Link>
            )}
            <button
              type="button"
              onClick={q.next}
              className="lfp-focus lfp-press ml-auto min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]"
            >
              {isLast ? d.seeResult : d.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── result ─────────────────────────────────────────────── */

function ScoreRing({ value, label }: { value: number; label: string }) {
  const reduced = useReducedMotion() ?? false;
  const r = 54;
  const c = 2 * Math.PI * r;
  const tone = value >= 0.6 ? "var(--lfp-verde)" : value >= 0.35 ? "var(--lfp-ouro)" : "var(--lfp-vermelho)";
  return (
    <svg viewBox="0 0 128 128" className="h-32 w-32" role="img" aria-label={label}>
      <circle cx={64} cy={64} r={r} fill="none" stroke="var(--lfp-line)" strokeWidth={10} />
      <motion.circle
        cx={64}
        cy={64}
        r={r}
        fill="none"
        stroke={tone}
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={c}
        transform="rotate(-90 64 64)"
        initial={reduced ? false : { strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - value) }}
        transition={reduced ? { duration: 0 } : { duration: 0.9, ease: "easeOut" }}
      />
      <text x={64} y={70} textAnchor="middle" className="lfp-num" fontSize={22} fontWeight={600} fill="var(--lfp-cobalt-deep)">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

function ResultView({ q, lang }: { q: ReturnType<typeof useQuizState>; lang: "pt" | "en" }) {
  const { t } = useLfpLang();
  const d = t.quiz.quiz;
  const run = q.run!;
  const total = run.questionIds.length;
  const correct = run.questionIds.filter((id) => run.answers[id]?.correct).length;
  const score = total ? correct / total : 0;
  const band = bandFor(score);

  const byCat = CATEGORIES.map((c) => {
    const ids = run.questionIds.filter((id) => q.byId.get(id)?.category === c);
    const ok = ids.filter((id) => run.answers[id]?.correct).length;
    return { c, ok, n: ids.length };
  }).filter((x) => x.n > 0);

  const wrong = run.questionIds.filter((id) => run.answers[id] && !run.answers[id].correct).map((id) => q.byId.get(id)!).filter(Boolean);

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div className="lfp-panel flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <ScoreRing value={score} label={tr(d.result.score, { n: correct, total })} />
        <div>
          <p className="lfp-eyebrow">{d.result.eyebrow} · {tr(d.result.score, { n: correct, total })}</p>
          <h2 className="lfp-display mt-1 text-3xl font-semibold">{d.result.bands[band]}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{d.result.bandBodies[band]}</p>
        </div>
      </div>

      {byCat.length > 1 && (
        <div className="lfp-panel p-5">
          <p className="lfp-eyebrow mb-3">{d.result.byCategory}</p>
          <ul className="space-y-2">
            {byCat.map(({ c, ok, n }) => (
              <li key={c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                <span>{d.modes[c]}</span>
                <span className="lfp-num">{ok}/{n}</span>
                <span className="col-span-2 h-2 overflow-hidden rounded-sm bg-[var(--lfp-line)]" aria-hidden="true">
                  <span className="block h-full rounded-sm bg-[var(--lfp-verde)]" style={{ width: `${(ok / n) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="lfp-panel p-5">
        <p className="lfp-eyebrow mb-3">{d.result.review}</p>
        {wrong.length === 0 ? (
          <p className="text-sm text-[var(--lfp-mist)]">{d.result.reviewEmpty}</p>
        ) : (
          <ul className="divide-y divide-[var(--lfp-line)]">
            {wrong.map((w) => (
              <li key={w.id} className="space-y-1.5 py-3">
                <p className="font-medium">{w.prompt[lang]}</p>
                <p className="text-sm">
                  <span className="text-[var(--lfp-mist)]">{d.correctWas}</span>{" "}
                  <span className="lfp-keep font-semibold">{w.options[lang][w.correctIndex]}</span>
                </p>
                <p className="text-sm leading-relaxed text-[var(--lfp-mist)]">{w.explanation[lang]}</p>
                {w.learnMore && (
                  <Link href={w.learnMore} className="lfp-focus inline-flex min-h-11 items-center text-sm font-medium text-[var(--lfp-cobalt)] underline underline-offset-2">
                    {d.learnMore} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => q.start(run.mode, total)}
          className="lfp-focus lfp-press min-h-11 rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]"
        >
          {d.result.again}
        </button>
        <button
          type="button"
          onClick={q.reset}
          className="lfp-focus lfp-press min-h-11 rounded-lg border border-[var(--lfp-line)] px-5 text-sm hover:border-[var(--lfp-cobalt)]"
        >
          {d.result.otherMode}
        </button>
        <Link
          href="/lfp/perfil"
          className="lfp-focus inline-flex min-h-11 items-center px-3 text-sm font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
        >
          {d.result.profile} →
        </Link>
      </div>
    </div>
  );
}
