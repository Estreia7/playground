"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { errorText, usePadel } from "../../ui/PadelProvider";
import { Loading, MEDALS, Page, TopBar } from "../../ui/parts";
import { average, diff, isScored, progress, roundComplete, standings } from "../../core/standings.ts";
import type { Match, Round, Tournament } from "../../core/types.ts";
import { ScoreSheet } from "./ScoreSheet";

type Tab = "games" | "table";

export function TournamentView() {
  const { id } = useParams<{ id: string }>();
  const { club, t } = usePadel();
  const tournament = club?.tournaments.find((x) => x.id === id);

  if (!club) {
    return (
      <>
        <TopBar title={t("appName")} back="/padel" />
        <Page nav={false}>
          <Loading />
        </Page>
      </>
    );
  }
  if (!tournament) {
    return (
      <>
        <TopBar title={t("appName")} back="/padel" />
        <Page nav={false}>
          <p className="py-16 text-center text-zinc-400">{t("t.notFound")}</p>
        </Page>
      </>
    );
  }
  return <Loaded tournament={tournament} />;
}

/** The round to open on: the first one still missing a score. */
function firstOpenRound(x: Tournament): number {
  return x.rounds.find((r) => !r.matches.every(isScored))?.n ?? x.rounds[x.rounds.length - 1]?.n ?? 1;
}

function Loaded({ tournament: x }: { tournament: Tournament }) {
  const { t, act, nameOf } = usePadel();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("games");
  const [roundN, setRoundN] = useState(() => firstOpenRound(x));
  const [editing, setEditing] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pills = useRef<HTMLDivElement>(null);

  const round = x.rounds.find((r) => r.n === roundN) ?? x.rounds[0];
  const last = x.rounds[x.rounds.length - 1];
  const p = progress(x);
  const complete = p.scored === p.total;
  const finished = x.status === "finished";
  const canDraw = x.format === "mexicano" && !finished && !!last && roundComplete(x, last.n);
  // Mexicano can always draw another round, so "done" means the planned ones are in.
  const readyToFinish = !finished && complete && (x.format !== "mexicano" || x.rounds.length >= x.plannedRounds);

  // Keep the selected round's pill in view as rounds are added or chosen.
  useEffect(() => {
    pills.current?.querySelector<HTMLElement>(`[data-round="${roundN}"]`)?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [roundN, x.rounds.length]);

  async function run(action: Parameters<typeof act>[0], after?: (id?: string) => void) {
    setBusy(true);
    setError("");
    const r = await act(action);
    setBusy(false);
    if (r.ok) after?.(r.id);
    else setError(errorText(t, r.error));
  }

  const champion = finished ? standings(x, nameOf).lines[0] : null;
  const totalRounds = x.format === "mexicano" ? Math.max(x.plannedRounds, x.rounds.length) : x.rounds.length;

  return (
    <>
      <TopBar title={x.name} back="/padel" />
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 border-b border-zinc-900 bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-2">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-900 p-1" role="tablist">
            {(["games", "table"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`min-h-11 rounded-lg text-base font-semibold ${tab === k ? "bg-zinc-700 text-white" : "text-zinc-400"}`}
              >
                {t(k === "games" ? "t.games" : "t.table")}
              </button>
            ))}
          </div>
          {tab === "games" && (
            <div ref={pills} className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {x.rounds.map((r) => {
                const done = r.matches.every(isScored);
                const on = r.n === round.n;
                return (
                  <button
                    key={r.n}
                    data-round={r.n}
                    onClick={() => setRoundN(r.n)}
                    aria-pressed={on}
                    className={`min-h-10 min-w-12 shrink-0 rounded-full px-3 text-base font-bold tabular-nums ${
                      on ? "bg-lime-300 text-zinc-950" : done ? "bg-zinc-800 text-lime-300" : "bg-zinc-900 text-zinc-400"
                    }`}
                  >
                    {r.n}
                    {done && !on ? " ✓" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Page nav={false}>
        {champion && (
          <div className="mb-4 rounded-2xl border border-lime-300/40 bg-lime-300/10 p-4 text-center">
            <p className="text-sm uppercase tracking-wider text-lime-300/80">
              {t(champion.ids.length > 1 ? "t.champions" : "t.champion")}
            </p>
            <p className="mt-1 text-2xl font-bold text-lime-300">🏆 {champion.ids.map(nameOf).join(" / ")}</p>
          </div>
        )}

        {tab === "games" ? (
          <RoundView
            tournament={x}
            round={round}
            totalRounds={totalRounds}
            onEdit={setEditing}
          />
        ) : (
          <StandingsTable tournament={x} />
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
            {error}
          </p>
        )}

        {/* What to do next, in order of how likely it is. */}
        <div className="mt-6 space-y-3">
          {tab === "games" && round.matches.every(isScored) && round.n < last.n && (
            <button
              onClick={() => setRoundN(round.n + 1)}
              className="min-h-14 w-full rounded-2xl bg-zinc-800 text-lg font-bold active:bg-zinc-700"
            >
              {t("t.nextRoundBtn", { n: round.n + 1 })} →
            </button>
          )}

          {canDraw && (tab === "table" || round.n === last.n) && (
            <div>
              <button
                disabled={busy}
                onClick={() => run({ type: "nextRound", tournamentId: x.id }, () => setRoundN(last.n + 1))}
                className="min-h-14 w-full rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:opacity-50"
              >
                🎲 {t("t.generate", { n: last.n + 1 })}
              </button>
              <p className="mt-1.5 text-center text-sm text-zinc-500">{t("t.generateHint")}</p>
            </div>
          )}

          {readyToFinish && (
            <button
              disabled={busy}
              onClick={() => run({ type: "finish", tournamentId: x.id }, () => setTab("table"))}
              className="min-h-14 w-full rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:opacity-50"
            >
              🏁 {t("t.finish")}
            </button>
          )}

          {finished && <p className="text-center text-sm text-zinc-500">{t("t.editAfter")}</p>}

          <div className="flex gap-3 pt-6">
            {finished ? (
              <button
                disabled={busy}
                onClick={() => run({ type: "reopen", tournamentId: x.id })}
                className="min-h-12 flex-1 rounded-xl border border-zinc-800 font-semibold text-zinc-300"
              >
                {t("t.reopen")}
              </button>
            ) : (
              !readyToFinish && (
                <button
                  disabled={busy}
                  onClick={() => {
                    const missing = p.total - p.scored;
                    if (missing === 0 || window.confirm(t("t.confirmFinishEarly", { n: missing }))) {
                      run({ type: "finish", tournamentId: x.id }, () => setTab("table"));
                    }
                  }}
                  className="min-h-12 flex-1 rounded-xl border border-zinc-800 font-semibold text-zinc-300"
                >
                  {t("t.finishEarly")}
                </button>
              )
            )}
            <button
              disabled={busy}
              onClick={() => {
                if (window.confirm(t("t.confirmDelete", { name: x.name }))) {
                  run({ type: "deleteTournament", tournamentId: x.id }, () => router.push("/padel"));
                }
              }}
              className="min-h-12 flex-1 rounded-xl border border-red-500/30 font-semibold text-red-400"
            >
              {t("t.delete")}
            </button>
          </div>
        </div>
      </Page>

      {editing && (
        <ScoreSheet
          tournament={x}
          match={editing}
          roundN={round.n}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function RoundView({
  tournament: x,
  round,
  totalRounds,
  onEdit,
}: {
  tournament: Tournament;
  round: Round;
  totalRounds: number;
  onEdit: (m: Match) => void;
}) {
  const { t, nameOf } = usePadel();
  return (
    <>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500">
        {t("t.roundOf", { n: round.n, total: totalRounds })}
      </h2>
      <ul className="space-y-3">
        {round.matches.map((m) => {
          const scored = isScored(m);
          const aWon = scored && (m.scoreA as number) > (m.scoreB as number);
          const bWon = scored && (m.scoreB as number) > (m.scoreA as number);
          const side = (ids: string[], score: number | null, won: boolean) => (
            <div className="flex items-center gap-3">
              <span className={`min-w-0 flex-1 text-lg leading-tight ${won ? "font-bold text-white" : scored ? "text-zinc-400" : "text-zinc-100"}`}>
                {ids.map(nameOf).join(" · ")}
              </span>
              <span
                className={`w-14 shrink-0 text-right text-3xl font-bold tabular-nums ${
                  won ? "text-lime-300" : scored ? "text-zinc-400" : "text-zinc-700"
                }`}
              >
                {score ?? "–"}
              </span>
            </div>
          );
          return (
            <li key={m.id}>
              <button
                onClick={() => onEdit(m)}
                className={`block w-full rounded-2xl border p-4 text-left active:bg-zinc-900 ${
                  scored ? "border-zinc-800 bg-zinc-900/40" : "border-zinc-700 bg-zinc-900"
                }`}
              >
                <p className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <span>{t("t.court", { n: m.court })}</span>
                  {!scored && <span className="normal-case tracking-normal text-lime-300/80">{t("t.tapToScore")}</span>}
                </p>
                {side(m.a, m.scoreA, aWon)}
                <div className="my-2 h-px bg-zinc-800" />
                {side(m.b, m.scoreB, bWon)}
              </button>
            </li>
          );
        })}
      </ul>
      {round.byes.length > 0 && (
        <p className="mt-4 rounded-xl bg-zinc-900/60 px-4 py-3 text-base text-zinc-400">
          <span aria-hidden>☕ </span>
          <span className="font-semibold text-zinc-300">{t("t.resting")}:</span> {round.byes.map(nameOf).join(", ")}
        </p>
      )}
      {x.rounds.every((r) => r.matches.every(isScored)) && x.status === "active" && x.format !== "mexicano" && (
        <p className="mt-4 text-center text-sm text-lime-300/80">{t("t.allScored")}</p>
      )}
    </>
  );
}

function StandingsTable({ tournament: x }: { tournament: Tournament }) {
  const { t, nameOf } = usePadel();
  const { lines, byAverage } = standings(x, nameOf);
  const teams = x.format === "teams";
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-base">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-10 py-2.5 pl-3 text-left font-semibold">#</th>
              <th className="py-2.5 text-left font-semibold">{t(teams ? "col.team" : "col.player")}</th>
              <th className="w-9 py-2.5 text-center font-semibold">{t("col.played")}</th>
              <th className="w-9 py-2.5 text-center font-semibold">{t("col.won")}</th>
              {teams && <th className="w-9 py-2.5 text-center font-semibold">{t("col.lost")}</th>}
              <th className="w-14 py-2.5 text-center font-semibold">{t("col.diff")}</th>
              {!teams && (
                <th className="w-16 py-2.5 pr-3 text-right font-semibold text-zinc-300">
                  {t(byAverage ? "col.avg" : "col.points")}
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {lines.map((l, i) => (
              <tr key={l.key} className={i < 3 && l.played > 0 ? "bg-zinc-900/40" : ""}>
                <td className="py-3 pl-3 text-lg tabular-nums text-zinc-500">
                  {i < 3 && l.played > 0 ? MEDALS[i] : i + 1}
                </td>
                <td className="py-3 pr-2 font-semibold leading-tight">{l.ids.map(nameOf).join(" / ")}</td>
                <td className="py-3 text-center tabular-nums text-zinc-400">{l.played}</td>
                <td className={`py-3 text-center tabular-nums ${teams ? "font-bold text-lime-300" : "text-zinc-400"}`}>{l.won}</td>
                {teams && <td className="py-3 text-center tabular-nums text-zinc-400">{l.lost}</td>}
                <td className="py-3 text-center tabular-nums text-zinc-400">
                  {diff(l) > 0 ? "+" : ""}
                  {diff(l)}
                </td>
                {!teams && (
                  <td className="py-3 pr-3 text-right text-xl font-bold tabular-nums text-lime-300">
                    {byAverage ? average(l).toFixed(1) : l.pointsFor}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{t("legend.table")}</p>
      {byAverage && <p className="mt-2 text-sm text-zinc-400">{t("t.avgNote")}</p>}
    </>
  );
}
