"use client";

import { useState } from "react";
import { errorText, usePadel } from "../ui/PadelProvider";
import { BottomNav, LangToggle, Loading, MEDALS, Page, TopBar } from "../ui/parts";
import { clubRanking, winRate, type RankingLine } from "../core/standings.ts";

export function RankingView() {
  const { club, t } = usePadel();
  const [open, setOpen] = useState<string | null>(null);
  const lines = club ? clubRanking(club) : [];

  return (
    <>
      <TopBar title={"🏆 " + t("rank.title")} right={<LangToggle />} />
      <Page>
        {!club ? (
          <Loading />
        ) : lines.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">{t("rank.empty")}</p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full text-base">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-10 py-2.5 pl-3 text-left font-semibold">#</th>
                  <th className="py-2.5 text-left font-semibold">{t("col.player")}</th>
                  <th className="w-9 py-2.5 text-center font-semibold">{t("col.tournaments")}</th>
                  <th className="w-9 py-2.5 text-center font-semibold">{t("col.titles")}</th>
                  <th className="w-12 py-2.5 text-center font-semibold">{t("col.winRate")}</th>
                  <th className="w-14 py-2.5 pr-3 text-right font-semibold text-zinc-300">{t("col.points")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900">
                {lines.map((l, i) => (
                  <Row key={l.playerId} line={l} place={i} open={open === l.playerId} onToggle={() => setOpen(open === l.playerId ? null : l.playerId)} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-base font-semibold text-zinc-300">{t("rank.how")}</summary>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("rank.howBody")}</p>
        </details>
      </Page>
      <BottomNav />
    </>
  );
}

function Row({ line: l, place, open, onToggle }: { line: RankingLine; place: number; open: boolean; onToggle: () => void }) {
  const { t, nameOf, act } = usePadel();
  const [error, setError] = useState("");
  const name = nameOf(l.playerId);

  async function rename() {
    const next = window.prompt(t("rank.renamePrompt", { name }), name);
    if (!next || next.trim() === name) return;
    const r = await act({ type: "renamePlayer", playerId: l.playerId, name: next });
    setError(r.ok ? "" : errorText(t, r.error));
  }

  return (
    <>
      <tr onClick={onToggle} className={`cursor-pointer active:bg-zinc-900 ${place < 3 ? "bg-zinc-900/40" : ""}`} aria-expanded={open}>
        <td className="py-3 pl-3 text-lg tabular-nums text-zinc-500">{place < 3 ? MEDALS[place] : place + 1}</td>
        <td className="py-3 pr-2 font-semibold leading-tight">{name}</td>
        <td className="py-3 text-center tabular-nums text-zinc-400">{l.tournaments}</td>
        <td className="py-3 text-center tabular-nums text-zinc-400">{l.titles || "·"}</td>
        <td className="py-3 text-center tabular-nums text-zinc-400">{Math.round(winRate(l) * 100)}</td>
        <td className="py-3 pr-3 text-right text-xl font-bold tabular-nums text-lime-300">{l.points}</td>
      </tr>
      {open && (
        <tr className="bg-zinc-900/70">
          <td colSpan={6} className="px-4 py-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-zinc-500">{t("rank.tournaments")}</dt>
                <dd className="text-base font-semibold">{l.tournaments}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t("rank.titles")} · {t("rank.podiums")}</dt>
                <dd className="text-base font-semibold">
                  {l.titles} · {l.podiums}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t("t.games")}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {t("rank.record", { won: l.won, lost: l.lost })}
                  {l.drawn > 0 && t("rank.drawn", { n: l.drawn })}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t("rank.form")}</dt>
                <dd className="flex gap-1 text-base font-semibold tabular-nums">
                  {l.form.slice(0, 5).map((p, i) => (
                    <span key={i} className={`rounded-md px-1.5 ${p === 1 ? "bg-lime-300 text-zinc-950" : "bg-zinc-800"}`}>
                      {p}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                rename();
              }}
              className="mt-3 min-h-11 rounded-xl bg-zinc-800 px-4 text-sm font-semibold"
            >
              ✏️ {t("rank.rename")}
            </button>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}
