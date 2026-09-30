"use client";

import { useEffect, useState } from "react";
import { errorText, usePadel } from "../../ui/PadelProvider";
import { LIMITS, type Match, type Round, type Tournament } from "../../core/types.ts";
import { roundTitle } from "../../ui/stage.ts";

/* Entering a score, one-handed, between points.

   Points scoring: tap the number one pair scored and the other pair's score
   fills itself in (they must add up to the match total). Games scoring: tap a
   number for each pair — the pad moves on to the second pair by itself.
   Either side can be picked first by tapping it. */

const GAMES_PAD = 13; // 0–12 covers sets, tie-breaks and timed matches

type Side = "a" | "b";

export function ScoreSheet({
  tournament: x,
  match: m,
  round,
  onClose,
}: {
  tournament: Tournament;
  match: Match;
  round: Round;
  onClose: () => void;
}) {
  const { t, act, nameOf } = usePadel();
  const points = x.scoring.kind === "points" ? x.scoring.total : null;
  const [a, setA] = useState<number | null>(m.scoreA);
  const [b, setB] = useState<number | null>(m.scoreB);
  const [side, setSide] = useState<Side>("a");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function pick(v: number) {
    if (points !== null) {
      if (side === "a") {
        setA(v);
        setB(points - v);
      } else {
        setB(v);
        setA(points - v);
      }
      return;
    }
    if (side === "a") {
      setA(v);
      setSide("b");
    } else {
      setB(v);
    }
  }

  function nudge(s: Side, delta: number) {
    const cur = (s === "a" ? a : b) ?? 0;
    const max = points ?? LIMITS.maxGames;
    const v = Math.max(0, Math.min(max, cur + delta));
    setSide(s);
    if (points !== null) {
      if (s === "a") {
        setA(v);
        setB(points - v);
      } else {
        setB(v);
        setA(points - v);
      }
    } else if (s === "a") setA(v);
    else setB(v);
  }

  async function save(scoreA: number | null, scoreB: number | null) {
    setSaving(true);
    setError("");
    const r = await act({ type: "setScore", tournamentId: x.id, matchId: m.id, scoreA, scoreB });
    setSaving(false);
    if (r.ok) onClose();
    else setError(errorText(t, r.error));
  }

  const names = (s: Side) => (s === "a" ? m.a : m.b).map(nameOf).join(" · ");
  const pad = Array.from({ length: (points ?? GAMES_PAD - 1) + 1 }, (_, i) => i);
  const current = side === "a" ? a : b;
  // A knockout match has to send one pair through.
  const level = !!round.ko && a !== null && a === b;
  const ready = a !== null && b !== null && !level;
  const title = round.ko
    ? t("score.titleKo", { court: m.court, stage: roundTitle(t, round) })
    : t("score.title", { court: m.court, round: round.n });

  const sideCard = (s: Side, value: number | null) => {
    const on = side === s;
    return (
      <div
        className={`flex items-center gap-2 rounded-2xl border-2 p-3 ${on ? "border-lime-300 bg-lime-300/10" : "border-zinc-800 bg-zinc-900"}`}
      >
        <button type="button" onClick={() => setSide(s)} aria-pressed={on} className="min-h-14 min-w-0 flex-1 text-left">
          <span className={`block text-lg font-semibold leading-tight ${on ? "text-white" : "text-zinc-300"}`}>{names(s)}</span>
        </button>
        <button
          type="button"
          onClick={() => nudge(s, -1)}
          aria-label={t("stepper.less")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xl font-bold active:bg-zinc-700"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setSide(s)}
          className={`w-14 shrink-0 text-center text-4xl font-bold tabular-nums ${on ? "text-lime-300" : "text-zinc-200"}`}
        >
          {value ?? "–"}
        </button>
        <button
          type="button"
          onClick={() => nudge(s, 1)}
          aria-label={t("stepper.more")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-xl font-bold active:bg-zinc-700"
        >
          +
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={t("score.close")} onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl border-t border-zinc-800 bg-zinc-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-zinc-700" aria-hidden />
        <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-zinc-500">
          {title}
        </p>

        <div className="space-y-2">
          {sideCard("a", a)}
          {sideCard("b", b)}
        </div>

        <p className="mb-2 mt-4 text-sm text-zinc-400">
          {t(points !== null ? "score.pointsFor" : "score.gamesFor", { names: names(side) })}
          {points !== null && current !== null && (
            <span className="text-zinc-500"> — {t("score.other", { n: points - current })}</span>
          )}
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {pad.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => pick(v)}
              aria-pressed={current === v}
              className={`h-11 rounded-xl text-lg font-bold tabular-nums ${
                current === v ? "bg-lime-300 text-zinc-950" : "bg-zinc-900 text-zinc-200 active:bg-zinc-800"
              }`}
            >
              {v}
            </button>
          ))}
        </div>

        {level && !error && (
          <p role="status" className="mt-3 rounded-xl bg-amber-400/10 px-4 py-3 text-amber-200">
            {t("err.needWinner")}
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </p>
        )}

        {/* Pinned, so Save is always under the thumb however long the pad is. */}
        <div className="sticky bottom-0 -mx-4 mt-3 flex gap-2 bg-zinc-950 px-4 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-14 flex-1 rounded-2xl border border-zinc-800 text-base font-semibold text-zinc-300"
          >
            {t("score.cancel")}
          </button>
          <button
            type="button"
            disabled={!ready || saving}
            onClick={() => save(a, b)}
            className="min-h-14 flex-[2] rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:bg-zinc-800 disabled:text-zinc-500"
          >
            {saving ? t("score.saving") : t("score.save")}
          </button>
        </div>
        {m.scoreA !== null && (
          <button
            type="button"
            disabled={saving}
            onClick={() => save(null, null)}
            className="mt-2 min-h-12 w-full text-sm font-semibold text-red-400"
          >
            {t("score.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
