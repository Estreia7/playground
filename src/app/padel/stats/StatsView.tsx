"use client";

import { useMemo, useState } from "react";
import { usePadel } from "../ui/PadelProvider";
import { BottomNav, LangToggle, Loading, Page, Place, Section, TopBar } from "../ui/parts";
import { EmptyArt, IconBars, IconFlame, IconLink, IconLinkBroken, IconTarget, Medal } from "../ui/art";
import { TiltCard } from "../ui/TiltCard";
import {
  highlights,
  playerStats,
  playersWithStats,
  tallyWinRate,
  type Highlight,
  type PairTally,
  type PlayerStats,
} from "../core/playerStats.ts";

/* One player's record, in the order the questions get asked.

   Pick someone, and the page answers: how have you done, who do you win with,
   who beats you, and what happened in each tournament. The headline numbers
   come first because they are what people look for; the partner and opponent
   tables come last because they are what people argue about, and an argument
   wants the full table rather than a summary.

   Everything is derived from match scores at render time, so a corrected score
   shows up here on the next refresh without anything to rebuild. */

export function StatsView() {
  const { club, t, nameOf } = usePadel();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const eligible = useMemo(() => (club ? playersWithStats(club) : []), [club]);

  const sortedPlayers = useMemo(() => {
    return eligible
      .map((id) => ({ id, name: nameOf(id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eligible, nameOf]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sortedPlayers.filter((p) => p.name.toLowerCase().includes(q)) : sortedPlayers;
  }, [sortedPlayers, query]);

  const stats = useMemo(
    () => (club && selected ? playerStats(club, selected) : null),
    [club, selected],
  );

  return (
    <>
      <TopBar title={t("stats.title")} icon={<IconBars size={22} className="text-lime-300" />} right={<LangToggle />} />
      <Page>
        {!club ? (
          <Loading />
        ) : eligible.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <EmptyArt kind="bars" />
            <p className="mt-2 max-w-xs text-zinc-500">{t("stats.empty")}</p>
          </div>
        ) : !stats ? (
          <Picker
            players={shown}
            query={query}
            onQuery={setQuery}
            onPick={setSelected}
            total={sortedPlayers.length}
          />
        ) : (
          <PlayerReport stats={stats} onBack={() => setSelected(null)} />
        )}
      </Page>
      <BottomNav />
    </>
  );
}

function Picker({
  players,
  query,
  onQuery,
  onPick,
  total,
}: {
  players: { id: string; name: string }[];
  query: string;
  onQuery: (q: string) => void;
  onPick: (id: string) => void;
  total: number;
}) {
  const { t } = usePadel();

  return (
    <>
      <h2 className="mb-1 text-lg font-bold">{t("stats.pick")}</h2>
      <p className="mb-4 text-sm text-zinc-500">{t("stats.scope")}</p>

      {/* The search box only earns its place once the list is long enough to
          scroll past a thumb. */}
      {total > 8 && (
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("stats.search")}
          aria-label={t("stats.search")}
          className="mb-4 h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-base outline-none placeholder:text-zinc-600 focus:border-lime-300"
        />
      )}

      {players.length === 0 ? (
        <p className="py-10 text-center text-zinc-500">{t("stats.noMatch")}</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-zinc-800 divide-y divide-zinc-900">
          {players.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left text-base font-semibold active:bg-zinc-900"
              >
                <span className="truncate">{p.name}</span>
                <span aria-hidden className="text-zinc-600">
                  ›
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PlayerReport({ stats, onBack }: { stats: PlayerStats; onBack: () => void }) {
  const { t, nameOf } = usePadel();
  const name = nameOf(stats.playerId);
  const marks = highlights(stats);
  const played = stats.total.played;

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-2xl font-bold tracking-tight">{name}</h2>
          <p className="text-sm text-zinc-500">{t("stats.scope")}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 shrink-0 rounded-xl bg-zinc-800 px-4 text-sm font-semibold active:bg-zinc-700"
        >
          {t("stats.change")}
        </button>
      </div>

      {played === 0 ? (
        <p className="py-12 text-center text-zinc-500">{t("stats.noMatches", { name })}</p>
      ) : (
        <>
          <Headline stats={stats} />
          <Marks marks={marks} />
          <Form stats={stats} />
          <PairTable
            title={t("stats.partners")}
            column={t("stats.colWith")}
            rows={stats.partners}
          />
          <PairTable
            title={t("stats.opponents")}
            column={t("stats.colAgainst")}
            rows={stats.opponents}
          />
          <History stats={stats} />
        </>
      )}
    </>
  );
}

/* The four numbers people look for first, then the supporting detail. */
function Headline({ stats }: { stats: PlayerStats }) {
  const { t } = usePadel();
  const { total } = stats;
  const rate = Math.round(tallyWinRate(total) * 100);
  const diff = total.pointsFor - total.pointsAgainst;

  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      <Tile label={t("stats.games")} value={String(total.played)} />
      <Tile
        label={t("stats.winRate")}
        value={rate + "%"}
        tone={rate >= 50 ? "good" : rate < 35 ? "bad" : "plain"}
      />
      <Tile
        label={t("stats.tournaments")}
        value={String(stats.tournaments)}
        foot={
          stats.titles > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Medal place={1} size={16} />
              {stats.titles}
            </span>
          ) : stats.podiums > 0 ? (
            <span className="inline-flex items-center gap-1.5">
              <Medal place={3} size={16} />
              {stats.podiums}
            </span>
          ) : undefined
        }
      />
      <Tile
        label={t("stats.bestPlace")}
        value={stats.bestPlace === null ? "·" : String(stats.bestPlace)}
        foot={
          stats.averagePlace === null
            ? undefined
            : t("stats.averagePlace") + " " + stats.averagePlace.toFixed(1)
        }
      />

      <div className="col-span-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-zinc-500">{t("stats.games")}</dt>
          <dd className="text-right font-semibold tabular-nums">
            {total.drawn > 0
              ? t("stats.record", { won: total.won, drawn: total.drawn, lost: total.lost })
              : t("stats.recordNoDraws", { won: total.won, lost: total.lost })}
          </dd>

          <dt className="text-zinc-500">{t("stats.pointsPerGame")}</dt>
          <dd className="text-right font-semibold tabular-nums">
            <span className="text-lime-300">{stats.pointsForPerMatch.toFixed(1)}</span>
            <span className="text-zinc-600"> / </span>
            <span className="text-red-300">{stats.pointsAgainstPerMatch.toFixed(1)}</span>
            <span
              className={`ml-2 text-xs ${diff > 0 ? "text-lime-300" : diff < 0 ? "text-red-300" : "text-zinc-500"}`}
            >
              ({diff > 0 ? "+" : ""}
              {diff})
            </span>
          </dd>
        </dl>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  foot,
  tone = "plain",
}: {
  label: string;
  value: string;
  foot?: React.ReactNode;
  /** Colour follows the meaning of the number, never the fact that it is the
      headline one — a poor win rate in lime would read as congratulation. */
  tone?: "plain" | "good" | "bad";
}) {
  const colour =
    tone === "good" ? "text-lime-300" : tone === "bad" ? "text-red-300" : "text-zinc-100";
  return (
    <TiltCard
      className="rounded-2xl"
      faceClassName="rounded-2xl border border-zinc-800 bg-zinc-900/50"
      max={7}
      lift={1.02}
    >
      <span className="block px-4 py-3">
        <span className="pd-z1 block text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className={`pd-z2 mt-0.5 block text-3xl font-bold tabular-nums ${colour}`}>{value}</span>
        {foot && <span className="pd-z1 mt-0.5 block truncate text-xs tabular-nums text-zinc-500">{foot}</span>}
      </span>
    </TiltCard>
  );
}

/* The four claims the page exists to make. Each carries its sample size,
   because "you win 80% with Ana" means something very different over twenty
   matches than over two. */
function Marks({ marks }: { marks: ReturnType<typeof highlights> }) {
  const { t } = usePadel();
  const any = marks.bestPartner || marks.worstPartner || marks.favouriteOpponent || marks.nemesis;
  if (!any) return null;

  return (
    <Section title={t("stats.highlights")}>
      <div className="grid gap-2">
        <Mark label={t("stats.bestPartner")} icon={<IconLink size={26} />} highlight={marks.bestPartner} />
        <Mark label={t("stats.worstPartner")} icon={<IconLinkBroken size={26} />} highlight={marks.worstPartner} />
        <Mark label={t("stats.favouriteOpponent")} icon={<IconTarget size={26} />} highlight={marks.favouriteOpponent} />
        <Mark label={t("stats.nemesis")} icon={<IconFlame size={26} />} highlight={marks.nemesis} />
      </div>
    </Section>
  );
}

function Mark({
  label,
  icon,
  highlight,
}: {
  label: string;
  icon: React.ReactNode;
  highlight: Highlight | null;
}) {
  const { t, nameOf } = usePadel();
  if (!highlight) return null;

  const rate = Math.round(highlight.rate * 100);
  // Below three shared matches the claim is barely evidence, and the card says
  // so rather than letting a single lucky night read as a pattern.
  const thin = highlight.played < 3;

  return (
    <TiltCard
      className="rounded-2xl"
      faceClassName="rounded-2xl border border-zinc-800 bg-zinc-900/40"
      max={5}
      lift={1.01}
    >
      <span className="flex items-center gap-3 px-4 py-3">
        <span
          aria-hidden
          className="pd-z2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-zinc-300"
        >
          {icon}
        </span>
        <span className="pd-z1 block min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</span>
          <span className="block truncate text-lg font-bold leading-tight">{nameOf(highlight.playerId)}</span>
          <span className="block text-sm tabular-nums text-zinc-400">
            {t("stats.highlightLine", { won: highlight.won, played: highlight.played, rate })}
          </span>
          {thin && (
            <span className="mt-0.5 block text-xs text-amber-300/80">
              {t("stats.smallSample", { n: highlight.played })}
            </span>
          )}
        </span>
        {/* The rate colours itself. A "best partner" you still lose with is not
            a success, and painting it green would say otherwise. */}
        <span
          className={`pd-z2 shrink-0 text-xl font-bold tabular-nums ${
            rate >= 50 ? "text-lime-300" : rate < 35 ? "text-red-300" : "text-zinc-300"
          }`}
        >
          {rate}%
        </span>
      </span>
    </TiltCard>
  );
}

function Form({ stats }: { stats: PlayerStats }) {
  const { t } = usePadel();
  if (stats.recentForm.length === 0) return null;

  const streakText =
    stats.currentStreak > 0
      ? t("stats.streakWins", { n: stats.currentStreak })
      : stats.currentStreak < 0
        ? t("stats.streakLosses", { n: -stats.currentStreak })
        : t("stats.streakNone");

  return (
    <Section title={t("stats.form")} aside={streakText}>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        {/* Newest on the left, which is how a form guide is read. */}
        <div className="flex flex-wrap gap-1.5">
          {stats.recentForm.map((result, i) => (
            <span
              key={i}
              title={result}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold ${
                result === "W"
                  ? "bg-lime-300 text-zinc-950"
                  : result === "L"
                    ? "bg-red-400/20 text-red-300"
                    : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {result}
            </span>
          ))}
        </div>
        <dl className="mt-3 flex gap-6 text-sm">
          <div>
            <dt className="text-zinc-500">{t("stats.bestRun")}</dt>
            <dd className="font-semibold tabular-nums text-lime-300">{stats.longestWinStreak}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">{t("stats.worstRun")}</dt>
            <dd className="font-semibold tabular-nums text-red-300">{stats.longestLossStreak}</dd>
          </div>
        </dl>
      </div>
    </Section>
  );
}

/* The full partner or opponent table.

   Sorted by matches together, so the people you actually play with sit at the
   top rather than whoever you beat once. */
function PairTable({
  title,
  column,
  rows,
}: {
  title: string;
  column: string;
  rows: PairTally[];
}) {
  const { t, nameOf } = usePadel();
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 6;

  if (rows.length === 0) {
    return (
      <Section title={title}>
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-6 text-center text-sm text-zinc-500">
          {t("stats.noPartners")}
        </p>
      </Section>
    );
  }

  const shown = expanded ? rows : rows.slice(0, LIMIT);

  return (
    <Section title={title} aside={rows.length > LIMIT ? String(rows.length) : undefined}>
      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <table className="w-full text-base">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="py-2.5 pl-3 text-left font-semibold">{column}</th>
              <th className="w-10 py-2.5 text-center font-semibold">{t("stats.colGames")}</th>
              <th className="w-10 py-2.5 text-center font-semibold">{t("stats.colWon")}</th>
              <th className="w-14 py-2.5 pr-3 text-right font-semibold">{t("stats.colRate")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {shown.map((row) => {
              const rate = Math.round(tallyWinRate(row) * 100);
              return (
                <tr key={row.playerId}>
                  <td className="truncate py-3 pl-3 pr-2 font-semibold leading-tight">
                    {nameOf(row.playerId)}
                  </td>
                  <td className="py-3 text-center tabular-nums text-zinc-400">{row.played}</td>
                  <td className="py-3 text-center tabular-nums text-zinc-400">{row.won}</td>
                  <td
                    className={`py-3 pr-3 text-right font-bold tabular-nums ${
                      rate >= 60 ? "text-lime-300" : rate <= 40 ? "text-red-300" : "text-zinc-300"
                    }`}
                  >
                    {rate}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length > LIMIT && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            className="min-h-12 w-full border-t border-zinc-900 bg-zinc-900/60 text-sm font-semibold text-zinc-400 active:bg-zinc-900"
          >
            {expanded ? "− " + shown.length : "+ " + (rows.length - LIMIT)}
          </button>
        )}
      </div>
    </Section>
  );
}

function History({ stats }: { stats: PlayerStats }) {
  const { t } = usePadel();
  if (stats.history.length === 0) return null;

  return (
    <Section title={t("stats.history")}>
      <ul className="grid gap-2">
        {stats.history.map((line) => (
          <li
            key={line.tournamentId}
            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3"
          >
            <span className="flex w-8 shrink-0 justify-center">
              <Place place={line.place} size={28} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold leading-tight">
                {line.name || t(("format." + line.format) as Parameters<typeof t>[0])}
              </div>
              <div className="text-sm tabular-nums text-zinc-500">
                {t("stats.place", { place: line.place, field: line.field })}
                {line.played > 0 && (
                  <>
                    {" · "}
                    {line.drawn > 0
                      ? t("stats.record", { won: line.won, drawn: line.drawn, lost: line.lost })
                      : t("stats.recordNoDraws", { won: line.won, lost: line.lost })}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
