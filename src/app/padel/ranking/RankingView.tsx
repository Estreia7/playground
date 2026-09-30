"use client";

import { useState } from "react";
import { errorText, usePadel } from "../ui/PadelProvider";
import { BottomNav, LangToggle, Loading, Page, Place, TopBar } from "../ui/parts";
import { EmptyArt, IconPencil, IconTrophy, Medal } from "../ui/art";
import { TiltCard } from "../ui/TiltCard";
import { clubRanking, winRate, type RankingLine } from "../core/standings.ts";

export function RankingView() {
  const { club, t } = usePadel();
  const [open, setOpen] = useState<string | null>(null);
  const lines = club ? clubRanking(club) : [];

  return (
    <>
      <TopBar title={t("rank.title")} icon={<IconTrophy size={22} className="text-lime-300" />} right={<LangToggle />} />
      <Page>
        {!club ? (
          <Loading />
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <EmptyArt kind="trophy" />
            <p className="mt-2 max-w-xs text-zinc-500">{t("rank.empty")}</p>
          </div>
        ) : (
          <>
          {lines.length >= 3 && <Podium lines={lines.slice(0, 3)} />}
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full text-base">
              <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="w-10 py-2.5 pl-3 text-left font-semibold">#</th>
                  <th className="py-2.5 text-left font-semibold">{t("col.player")}</th>
                  <th className="w-9 py-2.5 text-center font-semibold">{t("col.tournaments")}</th>
                  <th className="w-9 py-2.5 text-center font-semibold" title={t("rank.titles")}>
                    <IconTrophy size={16} className="mx-auto" />
                    <span className="sr-only">{t("rank.titles")}</span>
                  </th>
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
          </>
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
        <td className="py-3 pl-3"><Place place={place + 1} size={24} /></td>
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
              <span className="inline-flex items-center gap-2"><IconPencil size={16} />{t("rank.rename")}</span>
            </button>
            {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          </td>
        </tr>
      )}
    </>
  );
}

/* The top three as cards standing at different heights. Each is a tilt card:
   under a thumb the medal, the name and the points sit at three depths and
   slide against each other. Second place stands to the left, as on a podium. */
function Podium({ lines }: { lines: RankingLine[] }) {
  const { nameOf } = usePadel();
  const order = [1, 0, 2]; // second, first, third — left to right
  return (
    <div className="mb-5 grid grid-cols-3 items-end gap-2">
      {order.map((i, col) => {
        const l = lines[i];
        const first = i === 0;
        return (
          <div key={l.playerId} className="pd-rise" style={{ ["--i" as string]: col }}>
            <TiltCard
              className="rounded-2xl"
              faceClassName={
                first
                  ? "rounded-2xl border border-lime-300/40 bg-[linear-gradient(180deg,#1d3a1a_0%,#10200f_100%)]"
                  : "rounded-2xl border border-zinc-800 bg-zinc-900/80"
              }
              max={first ? 11 : 9}
              lift={1.03}
            >
              <span className={`flex flex-col items-center px-2 text-center ${first ? "min-h-[156px] pt-5" : "min-h-[128px] pt-4"}`}>
                <span className="pd-z3 block">
                  <Medal place={(i + 1) as 1 | 2 | 3} size={first ? 46 : 36} />
                </span>
                <span className="pd-z2 mt-2 block w-full truncate text-sm font-bold leading-tight">{nameOf(l.playerId)}</span>
                <span className={`pd-z1 mt-auto block pb-3 font-bold tabular-nums text-lime-300 ${first ? "text-3xl" : "text-2xl"}`}>
                  {l.points}
                </span>
              </span>
            </TiltCard>
          </div>
        );
      })}
    </div>
  );
}
