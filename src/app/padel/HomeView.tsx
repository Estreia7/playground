"use client";

import { usePadel } from "./ui/PadelProvider";
import { BottomNav, LangToggle, Loading, Page, Section, TopBar } from "./ui/parts";
import { CourtAction, CourtBackdrop, EmptyArt, IconPlus, IconTrophy, LogoTile } from "./ui/art";
import { TiltCard } from "./ui/TiltCard";
import { progress, standings } from "./core/standings.ts";
import type { Tournament } from "./core/types.ts";

/* The home screen has one job — start a tournament — and one moment: the ball
   being rallied over the net on the card that does it. Everything else on the
   page stays still until touched. */

export function HomeView() {
  const { club, t } = usePadel();
  const active = club?.tournaments.filter((x) => x.status === "active") ?? [];
  const finished = club?.tournaments.filter((x) => x.status === "finished") ?? [];

  return (
    <>
      <TopBar
        title={t("appName")}
        icon={<LogoTile size={34} />}
        right={<LangToggle />}
      />
      <Page>
        <div className="pd-rise mb-6" style={{ ["--i" as string]: 0 }}>
          <NewTournamentCard />
        </div>

        {!club ? (
          <Loading />
        ) : club.tournaments.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <EmptyArt kind="court" />
            <p className="mt-2 max-w-xs text-zinc-500">{t("home.empty")}</p>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <Section title={t("home.active")}>
                <ul className="space-y-3">
                  {active.map((x, i) => (
                    <li key={x.id} className="pd-rise" style={{ ["--i" as string]: i + 1 }}>
                      <TournamentCard tournament={x} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
            {finished.length > 0 && (
              <Section title={t("home.finished")}>
                <ul className="space-y-3">
                  {finished.map((x, i) => (
                    <li key={x.id} className="pd-rise" style={{ ["--i" as string]: i + 1 + active.length }}>
                      <TournamentCard tournament={x} />
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}
      </Page>
      <BottomNav />
    </>
  );
}

/* The card that starts a tournament, with the court behind it.

   The floor and glass are painted into the card's clipped face so the rounded
   corners hold; the net, rackets and ball sit at three different depths, so as
   the card tips under a thumb they slide against each other. */
function NewTournamentCard() {
  const { t } = usePadel();
  return (
    <TiltCard
      href="/padel/new"
      className="rounded-3xl"
      faceClassName="rounded-3xl border border-lime-300/25 bg-[linear-gradient(180deg,#12283a_0%,#0b1823_100%)]"
      backdrop={<CourtBackdrop />}
      max={7}
      lift={1.02}
    >
      <span className="relative block min-h-[196px]">
        <span className="pd-z3 relative z-10 flex items-center gap-3 px-5 pt-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-300 text-zinc-950">
            <IconPlus size={24} />
          </span>
          <span className="min-w-0">
            <span className="block text-xl font-bold leading-tight text-white">{t("home.new")}</span>
            <span className="block text-sm leading-snug text-zinc-300">{t("home.newHint")}</span>
          </span>
        </span>
        <CourtAction />
      </span>
    </TiltCard>
  );
}

function TournamentCard({ tournament: x }: { tournament: Tournament }) {
  const { t, nameOf, lang } = usePadel();
  const p = progress(x);
  const winner = x.status === "finished" ? standings(x, nameOf).lines[0] : null;
  const date = new Date(x.createdAt).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB", {
    day: "numeric",
    month: "short",
  });

  return (
    <TiltCard
      href={`/padel/t/${x.id}`}
      className="rounded-2xl"
      faceClassName="rounded-2xl border border-zinc-800 bg-zinc-900/70"
      max={5}
      lift={1.01}
    >
      <span className="pd-z1 block p-4">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 truncate text-lg font-bold">{x.name}</span>
          <span className="shrink-0 text-sm text-zinc-500">{date}</span>
        </span>
        <span className="mt-0.5 block text-sm text-zinc-400">
          {t(`format.${x.format}`)} · {t("home.players", { n: x.playerIds.length })}
        </span>
        {winner ? (
          <span className="mt-3 flex items-center gap-2 text-base">
            <IconTrophy size={20} className="shrink-0 text-lime-300" />
            <span className="truncate font-semibold text-lime-300">{winner.ids.map(nameOf).join(" / ")}</span>
          </span>
        ) : (
          <span className="mt-3 block">
            <span className="block h-2 overflow-hidden rounded-full bg-zinc-800">
              <span
                className="pd-bar block h-full rounded-full bg-lime-300"
                style={{ width: `${p.total ? (p.scored / p.total) * 100 : 0}%` }}
              />
            </span>
            <span className="mt-1.5 block text-sm tabular-nums text-zinc-500">
              {t("home.progress", { scored: p.scored, total: p.total })}
            </span>
          </span>
        )}
      </span>
    </TiltCard>
  );
}
