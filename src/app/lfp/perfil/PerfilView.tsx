"use client";

import Link from "next/link";
import { useMemo } from "react";
import { pct } from "../format";
import { tr } from "../i18n";
import { PageIntro, Shell } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import { useQuizState } from "../useQuizState";
import { CATEGORIES, dayStreak, type QuizMode } from "../quiz/engine";

const MASTERY_MIN_ATTEMPTS = 5;
const MASTERY_THRESHOLD = 0.8;

export default function PerfilView() {
  const q = useQuizState();
  const { t, lang } = useLfpLang();
  const p = t.quiz.perfil;
  const modes = t.quiz.quiz.modes;
  const bands = t.quiz.quiz.result.bands;

  // Computed after hydration only: Date.now() and localStorage are
  // client-side facts, and the server renders the loading state.
  const stats = useMemo(() => {
    if (!q.hydrated || !q.bank) return null;
    const now = Date.now();
    const entries = Object.entries(q.progress.seen);
    const attempts = entries.reduce((s, [, e]) => s + e.attempts, 0);
    const correct = entries.reduce((s, [, e]) => s + e.correct, 0);

    const byCat = CATEGORIES.map((c) => {
      const ids = new Set(q.bank!.filter((x) => x.category === c).map((x) => x.id));
      let a = 0;
      let k = 0;
      for (const [id, e] of entries) if (ids.has(id)) { a += e.attempts; k += e.correct; }
      return { c, attempts: a, correct: k, rate: a ? k / a : 0, mastered: a >= MASTERY_MIN_ATTEMPTS && k / a >= MASTERY_THRESHOLD };
    });

    return {
      streak: dayStreak(q.progress.activeDays, now),
      attempts,
      correct,
      accuracy: attempts ? correct / attempts : 0,
      due: q.dueCount.geral ?? 0,
      byCat,
      badges: (Object.keys(q.progress.best) as QuizMode[]).map((m) => ({ mode: m, ...q.progress.best[m]! })),
    };
  }, [q.hydrated, q.bank, q.progress, q.dueCount]);

  const empty = stats !== null && stats.attempts === 0 && q.history.length === 0;

  return (
    <Shell crumbs={[{ label: p.crumb }]}>
      <PageIntro eyebrow={p.eyebrow} title={p.title} lede={p.lede} />

      {(!stats || q.loading) && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}

      {stats && empty && (
        <div className="lfp-tile flex flex-wrap items-center justify-between gap-4 p-6">
          <p className="text-sm text-[var(--lfp-mist)]">{p.noData}</p>
          <Link href="/lfp/quiz" className="lfp-focus lfp-press inline-flex min-h-11 items-center rounded-lg bg-[var(--lfp-cobalt)] px-5 text-sm font-semibold text-[var(--lfp-cal-tile)]">
            {p.noDataCta} →
          </Link>
        </div>
      )}

      {stats && !empty && (
        <div className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lfp-panel p-5">
              <dt className="lfp-eyebrow">{p.streak}</dt>
              <dd className="lfp-display mt-1 text-4xl font-semibold">
                <span className="lfp-num">{stats.streak}</span>{" "}
                <span className="text-lg font-normal text-[var(--lfp-mist)]">{stats.streak === 1 ? p.streakOne : p.streakMany}</span>
              </dd>
            </div>
            <div className="lfp-panel p-5">
              <dt className="lfp-eyebrow">{p.answered}</dt>
              <dd className="lfp-display lfp-num mt-1 text-4xl font-semibold">{stats.attempts}</dd>
            </div>
            <div className="lfp-panel p-5">
              <dt className="lfp-eyebrow">{p.accuracy}</dt>
              <dd className={`lfp-display lfp-num mt-1 text-4xl font-semibold ${stats.accuracy >= 0.6 ? "lfp-keep" : ""}`}>{pct(stats.accuracy, lang, 0)}</dd>
            </div>
            <div className="lfp-panel p-5">
              <dt className="lfp-eyebrow">{p.due}</dt>
              {/* The CTA lives inside the dd: a dl may only hold dt/dd pairs. */}
              <dd className="mt-1">
                <span className="lfp-display lfp-num block text-4xl font-semibold">{stats.due}</span>
                {stats.due > 0 ? (
                  <Link href="/lfp/quiz" className="lfp-focus mt-1 inline-flex min-h-11 items-center text-sm font-medium text-[var(--lfp-cobalt)] underline underline-offset-2">
                    {p.dueCta} →
                  </Link>
                ) : (
                  <span className="mt-1 block text-xs text-[var(--lfp-mist)]">{p.dueNone}</span>
                )}
              </dd>
            </div>
          </dl>

          <section className="lfp-panel p-5" aria-labelledby="lfp-mastery">
            <h2 id="lfp-mastery" className="text-sm font-semibold">{p.mastery}</h2>
            <p className="mt-1 text-xs text-[var(--lfp-mist)]">{p.masteryBody}</p>
            <ul className="mt-4 space-y-2.5">
              {stats.byCat.map((x) => (
                <li key={x.c} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="flex items-center gap-2">
                    {modes[x.c]}
                    {x.mastered && (
                      <span className="lfp-eyebrow rounded-full bg-[var(--lfp-verde-dim)] px-2 py-0.5 text-[var(--lfp-verde)]">{p.mastered}</span>
                    )}
                  </span>
                  <span className="lfp-num text-[var(--lfp-mist)]">
                    {x.attempts ? `${x.correct}/${x.attempts} · ${pct(x.rate, lang, 0)}` : p.masteryNone}
                  </span>
                  <span className="col-span-2 h-2 overflow-hidden rounded-sm bg-[var(--lfp-line)]" aria-hidden="true">
                    <span
                      className={`block h-full rounded-sm ${x.mastered ? "bg-[var(--lfp-verde)]" : "bg-[var(--lfp-cobalt)]"}`}
                      style={{ width: `${x.rate * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="lfp-panel p-5" aria-labelledby="lfp-badges">
            <h2 id="lfp-badges" className="text-sm font-semibold">{p.badges}</h2>
            <p className="mt-1 text-xs text-[var(--lfp-mist)]">{p.badgesBody}</p>
            {stats.badges.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--lfp-mist)]">{p.badgesNone}</p>
            ) : (
              <ul className="mt-4 flex flex-wrap gap-2">
                {stats.badges.map((b) => (
                  <li key={b.mode} className="lfp-tile px-4 py-3">
                    <p className="lfp-eyebrow">{modes[b.mode]}</p>
                    <p className="lfp-display mt-0.5 text-lg font-semibold">{bands[b.band]}</p>
                    <p className="lfp-num text-xs text-[var(--lfp-mist)]">{pct(b.score, lang, 0)}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lfp-panel overflow-hidden" aria-labelledby="lfp-history">
            <h2 id="lfp-history" className="border-b border-[var(--lfp-line)] px-5 py-3 text-sm font-semibold">{p.history}</h2>
            {q.history.length === 0 ? (
              <p className="px-5 py-4 text-sm text-[var(--lfp-mist)]">{p.historyEmpty}</p>
            ) : (
              <ul className="divide-y divide-[var(--lfp-line)]">
                {q.history.map((r) => (
                  <li key={r.runId} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span>{tr(p.historyLine, { mode: modes[r.mode], n: r.correct, total: r.total })}</span>
                    <span className="flex items-center gap-3">
                      <span className="lfp-eyebrow">{bands[r.band]}</span>
                      <span className="lfp-num text-xs text-[var(--lfp-mist)]">
                        {new Date(r.at).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB")}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <button
            type="button"
            onClick={() => {
              if (window.confirm(p.resetConfirm)) q.resetAll();
            }}
            className="lfp-focus min-h-11 text-sm text-[var(--lfp-mist)] underline underline-offset-2 hover:text-[var(--lfp-vermelho)]"
          >
            {p.reset}
          </button>
        </div>
      )}
    </Shell>
  );
}
