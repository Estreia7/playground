"use client";

import { useMemo, useState } from "react";
import { usePadel } from "../ui/PadelProvider";
import { BottomNav, LangToggle, Loading, Page, Place, Section, TopBar } from "../ui/parts";
import { EmptyArt, IconBars, IconBullseye, IconDuoClash, IconDuoStar, IconGhost, Medal } from "../ui/art";
import { TiltCard } from "../ui/TiltCard";
import {
  ChartCard,
  ColumnChart,
  FORM_MIN_MATCHES,
  FORM_WINDOW,
  FormChart,
  RateBars,
  ResultStrip,
  ResultsBar,
  niceStep,
  type Column,
} from "./charts";
import {
  MIN_SHARED_MATCHES,
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
   who beats you, how has it been going lately, and what happened in each
   tournament. The headline numbers come first because they are what people look
   for. Then the four names people argue about, then the charts that show the
   shape of it — a record is easier to believe when it can be seen than when it
   is only a row of figures.

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
          <Marks marks={marks} stats={stats} />
          <FormSection stats={stats} />
          <ByTournament stats={stats} />
          {/* The card's own title is the heading: a section label above it would
              say the same word twice. */}
          <ChartCard title={t("stats.partners")} note={t("stats.c.rateNote", { n: MIN_SHARED_MATCHES })}>
            <RateBars rows={stats.partners} nameOf={nameOf} minSample={MIN_SHARED_MATCHES} />
          </ChartCard>
          <ChartCard title={t("stats.opponents")} note={t("stats.c.rateNote", { n: MIN_SHARED_MATCHES })}>
            <RateBars rows={stats.opponents} nameOf={nameOf} minSample={MIN_SHARED_MATCHES} />
          </ChartCard>
          <History stats={stats} />
        </>
      )}
    </>
  );
}

/* The four numbers people look for first, then the whole record as one bar. */
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

      <div className="col-span-2">
        <ChartCard title={t("stats.c.results")}>
          <ResultsBar won={total.won} drawn={total.drawn} lost={total.lost} />
          <p className="mt-3 flex items-baseline justify-between gap-3 border-t border-zinc-800 pt-3 text-sm">
            <span className="text-zinc-400">{t("stats.pointsPerGame")}</span>
            <span className="font-semibold tabular-nums text-zinc-100">
              {stats.pointsForPerMatch.toFixed(1)}
              <span className="text-zinc-500"> / </span>
              {stats.pointsAgainstPerMatch.toFixed(1)}
              <span className="ml-2 text-xs font-normal text-zinc-400">
                ({diff > 0 ? "+" : ""}
                {diff})
              </span>
            </span>
          </p>
        </ChartCard>
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

/* The four claims the page exists to make.

   Each carries its icon, its sample size and how those matches actually went,
   because "you win 80% with Ana" means something very different over twenty
   matches than over two. The icons say what the card says: a star over two
   players for the partner who works, lightning between them for the one who does
   not, an arrow in the gold for the opponent you beat, a ghost for the one who
   haunts you. */
function Marks({ marks, stats }: { marks: ReturnType<typeof highlights>; stats: PlayerStats }) {
  const { t } = usePadel();
  const any = marks.bestPartner || marks.worstPartner || marks.favouriteOpponent || marks.nemesis;
  if (!any) return null;

  return (
    <Section title={t("stats.highlights")}>
      <div className="grid gap-2">
        <Mark
          label={t("stats.bestPartner")}
          icon={<IconDuoStar size={28} />}
          good
          highlight={marks.bestPartner}
          source={stats.partners}
        />
        <Mark
          label={t("stats.worstPartner")}
          icon={<IconDuoClash size={28} />}
          highlight={marks.worstPartner}
          source={stats.partners}
        />
        <Mark
          label={t("stats.favouriteOpponent")}
          icon={<IconBullseye size={28} />}
          good
          highlight={marks.favouriteOpponent}
          source={stats.opponents}
        />
        <Mark
          label={t("stats.nemesis")}
          icon={<IconGhost size={28} />}
          highlight={marks.nemesis}
          source={stats.opponents}
        />
      </div>
    </Section>
  );
}

function Mark({
  label,
  icon,
  good,
  highlight,
  source,
}: {
  label: string;
  icon: React.ReactNode;
  good?: boolean;
  highlight: Highlight | null;
  source: PairTally[];
}) {
  const { t, nameOf } = usePadel();
  if (!highlight) return null;

  const rate = Math.round(highlight.rate * 100);
  const results = source.find((r) => r.playerId === highlight.playerId)?.results ?? [];
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
      <span className="flex items-center gap-3.5 px-4 py-3.5">
        {/* The tile takes the card's mood: lime for a good relationship, red for
            a bad one. The label and the strip say the same thing in words and
            shapes, so colour is never the only carrier. */}
        <span
          aria-hidden
          className={`pd-z2 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${
            good ? "bg-lime-300/10 text-lime-300" : "bg-red-400/10 text-red-300"
          }`}
        >
          {icon}
        </span>

        <span className="pd-z1 block min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">{label}</span>
          <span className="block truncate text-lg font-bold leading-tight">{nameOf(highlight.playerId)}</span>
          <span className="mt-1.5 flex items-center gap-2.5">
            {/* The last five is enough to show the trend, and it leaves the words
                beside it room to stay on one line. */}
            <ResultStrip results={results} max={5} size="md" />
            <span className="whitespace-nowrap text-sm tabular-nums text-zinc-400">
              {t("stats.c.matchesOf", { won: highlight.won, played: highlight.played })}
            </span>
          </span>
          {thin && (
            <span className="mt-1 block text-xs text-amber-300/80">
              {t("stats.smallSample", { n: highlight.played })}
            </span>
          )}
        </span>

        <span className="pd-z2 shrink-0 text-2xl font-bold tabular-nums text-zinc-50">{rate}%</span>
      </span>
    </TiltCard>
  );
}

/* How it has been going: the last ten results, then a curve of the win rate over
   a sliding window of matches. */
function FormSection({ stats }: { stats: PlayerStats }) {
  const { t } = usePadel();
  if (stats.recentForm.length === 0) return null;

  const streakText =
    stats.currentStreak > 0
      ? t("stats.streakWins", { n: stats.currentStreak })
      : stats.currentStreak < 0
        ? t("stats.streakLosses", { n: -stats.currentStreak })
        : t("stats.streakNone");
  const enough = stats.results.length >= FORM_MIN_MATCHES;

  return (
    <Section title={t("stats.form")} aside={streakText}>
      <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
        {/* Newest on the left, which is how a form guide is read. Letters, not
            only colours. */}
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
            <dt className="text-zinc-400">{t("stats.bestRun")}</dt>
            <dd className="font-semibold tabular-nums text-lime-300">{stats.longestWinStreak}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">{t("stats.worstRun")}</dt>
            <dd className="font-semibold tabular-nums text-red-300">{stats.longestLossStreak}</dd>
          </div>
        </dl>
      </div>

      <ChartCard
        title={t("stats.c.form")}
        note={enough ? t("stats.c.formNote", { n: FORM_WINDOW }) : t("stats.c.formNeeds", { n: FORM_MIN_MATCHES })}
        table={
          enough
            ? {
                head: [t("stats.c.matchCol"), t("stats.c.rate")],
                rows: formRows(stats),
              }
            : undefined
        }
      >
        {enough ? <FormChart results={stats.results} /> : null}
      </ChartCard>
    </Section>
  );
}

function formRows(stats: PlayerStats): string[][] {
  const rows: string[][] = [];
  for (let i = FORM_WINDOW - 1; i < stats.results.length; i++) {
    const wins = stats.results.slice(i - FORM_WINDOW + 1, i + 1).filter((r) => r === "W").length;
    rows.push([String(i + 1), Math.round((wins / FORM_WINDOW) * 100) + "%"]);
  }
  return rows.reverse();
}

/* The tournaments side by side: how often they won each one, and by how many
   points. Two questions, two charts — they are on different scales, so they are
   never put on one axis. */
function ByTournament({ stats }: { stats: PlayerStats }) {
  const { t, lang } = usePadel();

  // Oldest to newest, and only the last twelve: past that the columns get too
  // narrow to hover.
  const chron = useMemo(
    () => [...stats.history].reverse().filter((h) => h.played > 0).slice(-12),
    [stats.history],
  );
  if (chron.length < 2) return null;

  type Line = (typeof chron)[number];
  const dateOf = (iso: string) =>
    new Date(iso).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB", { day: "numeric", month: "short" });
  const nameFor = (h: Line) => h.name || t(`format.${h.format}` as Parameters<typeof t>[0]);
  const recordOf = (h: Line) =>
    h.drawn > 0
      ? t("stats.record", { won: h.won, drawn: h.drawn, lost: h.lost })
      : t("stats.recordNoDraws", { won: h.won, lost: h.lost });

  const rates: Column[] = chron.map((h) => {
    const rate = Math.round((h.won / h.played) * 100);
    return {
      key: h.tournamentId,
      label: dateOf(h.finishedAt),
      value: rate,
      title: nameFor(h),
      valueText: rate + "%",
      sub: recordOf(h),
    };
  });

  const diffs = chron.map((h) => h.pointsFor - h.pointsAgainst);
  // The axis spans what the data spans, plus zero. A symmetric axis would give a
  // player who has only ever won a whole empty half of the chart.
  const lowest = Math.min(0, ...diffs);
  const highest = Math.max(0, ...diffs);
  let floor = lowest < 0 ? -niceStep(-lowest) : 0;
  let ceiling = highest > 0 ? niceStep(highest) : 0;
  if (floor === 0 && ceiling === 0) {
    floor = -10;
    ceiling = 10;
  }
  const signed = (v: number) => (v > 0 ? "+" : "") + Math.round(v);
  const diffCols: Column[] = chron.map((h, i) => ({
    key: h.tournamentId,
    label: dateOf(h.finishedAt),
    value: diffs[i],
    title: nameFor(h),
    valueText: signed(diffs[i]),
    sub: `${h.pointsFor} ${t("stats.pointsFor")} · ${h.pointsAgainst} ${t("stats.pointsAgainst")}`,
  }));

  return (
    <Section title={t("stats.c.perTournament")}>
      <ChartCard
        title={t("stats.c.byTournament")}
        note={t("stats.c.byTournamentNote")}
        table={{
          head: [t("stats.c.tournament"), t("stats.c.rate")],
          rows: [...rates].reverse().map((c) => [`${c.title} · ${c.label}`, c.valueText]),
        }}
      >
        <ColumnChart
          items={rates}
          domain={[0, 100]}
          baseline={0}
          reference={50}
          format={(v) => Math.round(v) + "%"}
          ariaLabel={t("stats.c.ariaColumns", { n: rates.length })}
        />
      </ChartCard>

      <ChartCard
        title={t("stats.c.diff")}
        note={t("stats.c.diffNote")}
        table={{
          head: [t("stats.c.tournament"), t("stats.c.diffCol")],
          rows: [...diffCols].reverse().map((c) => [`${c.title} · ${c.label}`, c.valueText]),
        }}
      >
        <ColumnChart
          items={diffCols}
          domain={[floor, ceiling]}
          baseline={0}
          reference={0}
          format={signed}
          ariaLabel={t("stats.c.ariaColumns", { n: diffCols.length })}
        />
      </ChartCard>
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
