"use client";

import Link from "next/link";
import { usePadel } from "./ui/PadelProvider";
import { BottomNav, LangToggle, Loading, Page, Section, TopBar } from "./ui/parts";
import { progress, standings } from "./core/standings.ts";
import type { Tournament } from "./core/types.ts";

export function HomeView() {
  const { club, t } = usePadel();
  const active = club?.tournaments.filter((x) => x.status === "active") ?? [];
  const finished = club?.tournaments.filter((x) => x.status === "finished") ?? [];

  return (
    <>
      <TopBar title={"🎾 " + t("appName")} right={<LangToggle />} />
      <Page>
        <Link
          href="/padel/new"
          className="mb-6 flex min-h-20 items-center gap-4 rounded-2xl bg-lime-300 px-5 text-zinc-950 active:bg-lime-400"
        >
          <span className="text-4xl font-light leading-none">+</span>
          <span>
            <span className="block text-lg font-bold">{t("home.new")}</span>
            <span className="block text-sm text-zinc-800">{t("home.newHint")}</span>
          </span>
        </Link>

        {!club ? (
          <Loading />
        ) : club.tournaments.length === 0 ? (
          <p className="py-10 text-center text-zinc-500">{t("home.empty")}</p>
        ) : (
          <>
            {active.length > 0 && (
              <Section title={t("home.active")}>
                <ul className="space-y-3">
                  {active.map((x) => (
                    <TournamentCard key={x.id} tournament={x} />
                  ))}
                </ul>
              </Section>
            )}
            {finished.length > 0 && (
              <Section title={t("home.finished")}>
                <ul className="space-y-3">
                  {finished.map((x) => (
                    <TournamentCard key={x.id} tournament={x} />
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

function TournamentCard({ tournament: x }: { tournament: Tournament }) {
  const { t, nameOf, lang } = usePadel();
  const p = progress(x);
  const winner = x.status === "finished" ? standings(x, nameOf).lines[0] : null;
  const date = new Date(x.createdAt).toLocaleDateString(lang === "pt" ? "pt-PT" : "en-GB", {
    day: "numeric",
    month: "short",
  });
  return (
    <li>
      <Link
        href={`/padel/t/${x.id}`}
        className="block rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 active:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 truncate text-lg font-bold">{x.name}</h3>
          <span className="shrink-0 text-sm text-zinc-500">{date}</span>
        </div>
        <p className="mt-0.5 text-sm text-zinc-400">
          {t(`format.${x.format}`)} · {t("home.players", { n: x.playerIds.length })}
        </p>
        {winner ? (
          <p className="mt-3 text-base">
            🏆 <span className="font-semibold text-lime-300">{winner.ids.map(nameOf).join(" / ")}</span>
          </p>
        ) : (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-lime-300"
                style={{ width: `${p.total ? (p.scored / p.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1.5 text-sm tabular-nums text-zinc-500">
              {t("home.progress", { scored: p.scored, total: p.total })}
            </p>
          </div>
        )}
      </Link>
    </li>
  );
}
