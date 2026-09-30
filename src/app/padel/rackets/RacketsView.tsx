"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePadel } from "../ui/PadelProvider";
import { BottomNav, LangToggle, Page, TopBar } from "../ui/parts";
import { Sheet } from "../ui/Sheet";
import { IconCheck, IconExternal, IconPlus, IconRacket, IconTag } from "../ui/art";
import type { Key } from "../ui/i18n.ts";
import {
  arrange,
  seasonsFor,
  type Ratings,
  type RacketWithHistory,
  type SeasonResponse,
  type Shape,
  type Sort,
} from "./catalog.ts";

/* The rackets tab: the best of each season, as rated by Padelful, with the
   maker's list price. A season is one tap on the year; filters and the sort
   work on what is already loaded, so they answer instantly.

   The price history is this app's own: the server writes every price down once
   a month, so coming back next season shows what a racket used to cost. */

const PAGE = 20;
const MAX_COMPARE = 3;
const POLL_MS = 15_000;
const MAX_POLLS = 12;
const PRICE_CAPS = [100, 150, 200, 300];
const SHAPES: Shape[] = ["round", "tear", "diamond"];
const SORTS: Sort[] = ["rating", "value", "price"];
const AXES: (keyof Ratings)[] = ["power", "control", "rebound", "maneuverability", "sweetSpot"];

type T = (key: Key, vars?: Record<string, string | number>) => string;

function useFormat() {
  const { lang } = usePadel();
  const locale = lang === "pt" ? "pt-PT" : "en-GB";
  return useMemo(() => {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
    return {
      euro: (n: number) => money.format(n),
      month: (m: string) =>
        new Date(m + "-01T12:00:00Z").toLocaleDateString(locale, { month: "short", year: "numeric" }),
    };
  }, [locale]);
}

/* Padelful's words for feel, balance and style are English; these are the ones it uses. */
const WORDS: Record<string, [string, string]> = {
  soft: ["Macio", "Soft"],
  "medium-soft": ["Médio-macio", "Medium-soft"],
  medium: ["Médio", "Medium"],
  "medium-hard": ["Médio-duro", "Medium-hard"],
  hard: ["Duro", "Hard"],
  low: ["Baixo", "Low"],
  "medium-low": ["Médio-baixo", "Medium-low"],
  "medium-high": ["Médio-alto", "Medium-high"],
  high: ["Alto", "High"],
};

export function RacketsView() {
  const { t } = usePadel();
  const seasons = useMemo(() => seasonsFor(new Date()), []);
  const [season, setSeason] = useState(() => new Date().getFullYear());
  const [shape, setShape] = useState<Shape | null>(null);
  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<Sort>("rating");
  const [loaded, setLoaded] = useState<Record<number, SeasonResponse>>({});
  const [failed, setFailed] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<RacketWithHistory[]>([]);
  const [comparing, setComparing] = useState(false);
  const [finding, setFinding] = useState(false);

  const current = loaded[season];

  useEffect(() => {
    if (loaded[season]) return;
    const ctl = new AbortController();
    setFailed(null);
    fetch(`/api/padel/rackets?season=${season}`, { cache: "no-store", signal: ctl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<SeasonResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((json) => setLoaded((prev) => ({ ...prev, [season]: json })))
      .catch(() => !ctl.signal.aborted && setFailed(season));
    return () => ctl.abort();
  }, [season, loaded, attempt]);

  // Read through MCP, prices arrive a few at a time after the list: keep asking
  // while the server says it is still reading, for a few minutes at most.
  const polls = useRef<Record<number, number>>({});
  useEffect(() => {
    if (!current?.incomplete || (polls.current[season] ?? 0) >= MAX_POLLS) return;
    const id = window.setTimeout(() => {
      polls.current[season] = (polls.current[season] ?? 0) + 1;
      fetch(`/api/padel/rackets?season=${season}`, { cache: "no-store" })
        .then((r) => (r.ok ? (r.json() as Promise<SeasonResponse>) : Promise.reject()))
        .then((json) => setLoaded((prev) => ({ ...prev, [season]: json })))
        .catch(() => undefined);
    }, POLL_MS);
    return () => window.clearTimeout(id);
  }, [current, season]);

  // A new question starts from the top of its answer.
  useEffect(() => {
    setShown(PAGE);
    setOpen(null);
  }, [season, shape, maxPrice, sort]);

  const list = useMemo(() => (current ? arrange(current.rackets, { shape, maxPrice, sort }) : []), [current, shape, maxPrice, sort]);

  function togglePick(r: RacketWithHistory) {
    setPicked((prev) =>
      prev.some((p) => p.slug === r.slug)
        ? prev.filter((p) => p.slug !== r.slug)
        : prev.length >= MAX_COMPARE
          ? prev
          : [...prev, r],
    );
  }

  const chip = (on: boolean) =>
    `min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${
      on ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-zinc-800 text-zinc-300 active:bg-zinc-900"
    }`;

  return (
    <>
      <TopBar title={t("rk.title")} icon={<IconTag size={22} className="text-lime-300" />} right={<LangToggle />} />
      <Page>
        <p className="mb-4 text-sm leading-snug text-zinc-400">{t("rk.intro")}</p>

        <div role="radiogroup" aria-label={t("rk.season")} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {seasons.map((y) => (
            <button
              key={y}
              type="button"
              role="radio"
              aria-checked={season === y}
              onClick={() => setSeason(y)}
              className={`min-h-11 shrink-0 rounded-xl px-4 text-lg font-bold tabular-nums ${
                season === y ? "bg-lime-300 text-zinc-950" : "bg-zinc-900 text-zinc-400 active:bg-zinc-800"
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFinding(true)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-lime-300/30 bg-lime-300/[0.07] p-4 text-left active:bg-lime-300/10"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-lime-300 text-zinc-950">
            <IconRacket size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-lime-300">{t("rk.finder")}</span>
            <span className="block text-sm leading-snug text-zinc-400">{t("rk.finderHint")}</span>
          </span>
          <span className="text-2xl text-lime-300/70" aria-hidden>
            ›
          </span>
        </button>

        <div className="mb-5 space-y-3">
          <FilterRow label={t("rk.shape")}>
            <button type="button" aria-pressed={shape === null} onClick={() => setShape(null)} className={chip(shape === null)}>
              {t("rk.shape.all")}
            </button>
            {SHAPES.map((s) => (
              <button key={s} type="button" aria-pressed={shape === s} onClick={() => setShape(shape === s ? null : s)} className={chip(shape === s)}>
                {t(`rk.shape.${s}`)}
              </button>
            ))}
          </FilterRow>
          <FilterRow label={t("rk.price")}>
            <button type="button" aria-pressed={maxPrice === null} onClick={() => setMaxPrice(null)} className={chip(maxPrice === null)}>
              {t("rk.price.any")}
            </button>
            {PRICE_CAPS.map((n) => (
              <button key={n} type="button" aria-pressed={maxPrice === n} onClick={() => setMaxPrice(maxPrice === n ? null : n)} className={chip(maxPrice === n)}>
                {t("rk.price.upTo", { n })}
              </button>
            ))}
          </FilterRow>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1" role="radiogroup" aria-label={t("rk.sort")}>
            {SORTS.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={sort === s}
                onClick={() => setSort(s)}
                className={`min-h-10 rounded-lg text-sm font-semibold ${sort === s ? "bg-zinc-700 text-white" : "text-zinc-400"}`}
              >
                {t(`rk.sort.${s}`)}
              </button>
            ))}
          </div>
        </div>

        {!current ? (
          failed === season ? (
            <div className="py-12 text-center">
              <p className="text-zinc-400">{t("rk.error")}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 min-h-12 rounded-xl bg-zinc-800 px-5 font-semibold">
                {t("retry")}
              </button>
            </div>
          ) : (
            <Loading season={season} />
          )
        ) : (
          <>
            <p className="mb-2 text-sm text-zinc-500" aria-live="polite">
              {list.length === 1 ? t("rk.countOne") : t("rk.count", { n: list.length })}
              {current.incomplete && <span className="text-lime-300/80"> · {t("rk.fillingPrices")}</span>}
            </p>
            {/* Read through MCP, only the best of the year have a price yet; a
                price filter would otherwise quietly hide the rest. */}
            {current.source === "mcp" && (maxPrice !== null || sort !== "rating") && (
              <p className="mb-3 rounded-xl bg-zinc-900/70 px-3 py-2 text-xs leading-snug text-zinc-400">
                {t("rk.mcpPriced", { n: current.rackets.filter((r) => r.price !== null).length })}
              </p>
            )}
            {list.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-800 px-4 py-8 text-center text-zinc-500">{t("rk.none")}</p>
            ) : (
              <ol className="space-y-2">
                {list.slice(0, shown).map((r, i) => (
                  <li key={r.slug}>
                    <RacketCard
                      racket={r}
                      rank={i + 1}
                      open={open === r.slug}
                      onToggle={() => setOpen(open === r.slug ? null : r.slug)}
                      picked={picked.some((p) => p.slug === r.slug)}
                      canPick={picked.length < MAX_COMPARE}
                      onPick={() => togglePick(r)}
                    />
                  </li>
                ))}
              </ol>
            )}
            {list.length > shown && (
              <button
                type="button"
                onClick={() => setShown((n) => n + PAGE)}
                className="mt-3 min-h-12 w-full rounded-xl border border-zinc-800 font-semibold text-zinc-300 active:bg-zinc-900"
              >
                {t("rk.more", { n: Math.min(PAGE, list.length - shown) })}
              </button>
            )}
            <Footnote data={current} />
            {/* Room for the compare bar, so it never sits on the last racket. */}
            {picked.length > 0 && <div className="h-20" aria-hidden />}
          </>
        )}
      </Page>

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-4 pb-2">
          <div className="mx-auto flex max-w-xl items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/95 p-2 shadow-2xl backdrop-blur">
            <p className="min-w-0 flex-1 truncate px-2 text-sm text-zinc-300">{picked.map((p) => p.name).join(" · ")}</p>
            <button type="button" onClick={() => setPicked([])} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-zinc-400">
              {t("rk.compareClear")}
            </button>
            <button
              type="button"
              disabled={picked.length < 2}
              onClick={() => setComparing(true)}
              className="min-h-11 rounded-xl bg-lime-300 px-4 text-sm font-bold text-zinc-950 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {t("rk.compareN", { n: picked.length })}
            </button>
          </div>
        </div>
      )}

      {comparing && <CompareSheet rackets={picked} onClose={() => setComparing(false)} />}
      {finding && <FinderSheet onClose={() => setFinding(false)} />}
      <BottomNav />
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
      {children}
    </div>
  );
}

function Loading({ season }: { season: number }) {
  const { t } = usePadel();
  return (
    <div aria-busy="true">
      <p className="mb-1 text-sm font-semibold text-zinc-300" role="status">
        {t("rk.loading", { y: season })}
      </p>
      <p className="mb-3 text-sm text-zinc-500">{t("rk.loadingSlow")}</p>
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex h-[88px] animate-pulse items-center gap-3 rounded-2xl border border-zinc-900 bg-zinc-900/50 p-3">
            <div className="h-16 w-16 rounded-xl bg-zinc-800/80" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-zinc-800/80" />
              <div className="h-3 w-1/3 rounded bg-zinc-800/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footnote({ data }: { data: SeasonResponse }) {
  const { t } = usePadel();
  const hours = Math.max(0, Math.round((Date.now() - Date.parse(data.fetchedAt)) / 3600_000));
  const when = hours < 1 ? t("rk.now") : hours < 48 ? t("rk.hoursAgo", { n: hours }) : t("rk.daysAgo", { n: Math.round(hours / 24) });
  return (
    <div className="mt-6 space-y-1 text-xs leading-relaxed text-zinc-500">
      <p>{t("rk.pvpNote")}</p>
      <p>
        {t("rk.updated", { when })}
        {data.source === "mcp" && " " + t("rk.viaMcp")}
      </p>
    </div>
  );
}

function RacketImage({ racket, size }: { racket: RacketWithHistory; size: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--pd-tile)] text-[var(--pd-navy)]"
      style={{ width: size, height: size }}
    >
      {racket.image && !broken ? (
        <img
          src={racket.image}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-contain p-1"
        />
      ) : (
        <IconRacket size={Math.round(size * 0.55)} />
      )}
    </span>
  );
}

function PriceLine({ racket: r }: { racket: RacketWithHistory }) {
  const { t } = usePadel();
  const f = useFormat();
  if (r.price === null) return <span className="text-sm text-zinc-500">{t("rk.noPrice")}</span>;
  // The most recent price that differs from today's.
  const before = [...r.history].reverse().find((h) => h.price !== r.price);
  return (
    <span className="flex flex-wrap items-baseline gap-x-2">
      <span className="text-base font-bold tabular-nums text-zinc-100">{f.euro(r.price)}</span>
      {before && (
        <span className={`text-xs tabular-nums ${before.price > r.price ? "text-lime-300" : "text-amber-300"}`}>
          {t("rk.was", { price: f.euro(before.price), month: f.month(before.month) })}
        </span>
      )}
    </span>
  );
}

function RacketCard({
  racket: r,
  rank,
  open,
  onToggle,
  picked,
  canPick,
  onPick,
  showSeason = false,
}: {
  racket: RacketWithHistory;
  /** Suggestions mix seasons, so they say which year each racket is. */
  showSeason?: boolean;
  rank?: number;
  open: boolean;
  onToggle: () => void;
  picked?: boolean;
  canPick?: boolean;
  onPick?: () => void;
}) {
  const { t, lang } = usePadel();
  const f = useFormat();
  const word = (w: string | null) => (w ? (WORDS[w.toLowerCase()]?.[lang === "pt" ? 0 : 1] ?? w) : null);
  const specs: [string, string | null][] = [
    [t("rk.feel"), word(r.feel)],
    [t("rk.balance"), word(r.balance)],
    [t("rk.weight"), r.weight ? (r.weight[0] === r.weight[1] ? `${r.weight[0]} g` : `${r.weight[0]}–${r.weight[1]} g`) : null],
    [t("rk.core"), r.core],
    [t("rk.faces"), r.faces],
  ];
  const detailsId = "rk-" + r.slug;

  return (
    <div className={`overflow-hidden rounded-2xl border ${picked ? "border-lime-300/60" : "border-zinc-800"} bg-zinc-900/50`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={detailsId}
        className="flex w-full items-center gap-3 p-3 text-left active:bg-zinc-900"
      >
        {rank !== undefined && <span className="w-5 shrink-0 text-center text-sm font-semibold tabular-nums text-zinc-500">{rank}</span>}
        <RacketImage racket={r} size={64} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold leading-tight">{r.name}</span>
          <span className="mb-1 block truncate text-sm text-zinc-400">
            {r.brand}
            {r.shape && " · " + t(`rk.shape.${r.shape}`)}
            {showSeason && " · " + r.season}
          </span>
          <PriceLine racket={r} />
        </span>
        <span className="flex w-12 shrink-0 flex-col items-center">
          <span className="text-2xl font-bold tabular-nums leading-none text-lime-300">{r.rating.toFixed(1)}</span>
          <span className="mt-0.5 text-[11px] font-semibold text-zinc-500">/10</span>
        </span>
      </button>

      {open && (
        <div id={detailsId} className="border-t border-zinc-800 px-4 pb-4 pt-3">
          {r.ratings && (
            <>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("rk.axes")}</p>
              <dl className="mb-4 space-y-1.5">
                {AXES.map((k) => (
                  <div key={k} className="flex items-center gap-3 text-sm">
                    <dt className="w-28 shrink-0 text-zinc-400">{t(`rk.${k}`)}</dt>
                    <dd className="flex flex-1 items-center gap-2">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                        <span className="block h-full rounded-full bg-lime-300" style={{ width: `${(r.ratings as Ratings)[k] * 10}%` }} />
                      </span>
                      <span className="w-7 text-right font-semibold tabular-nums">{(r.ratings as Ratings)[k]}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <dl className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {specs
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-zinc-500">{k}</dt>
                  <dd className="truncate font-semibold">{v}</dd>
                </div>
              ))}
          </dl>
          {r.players.length > 0 && (
            <p className="mb-3 text-sm">
              <span className="text-zinc-500">{t("rk.players")}: </span>
              <span className="font-semibold">{r.players.join(", ")}</span>
            </p>
          )}
          {r.history.length > 0 && <p className="mb-3 text-xs text-zinc-500">{t("rk.tracked", { month: f.month(r.history[0].month) })}</p>}
          <div className="flex gap-2">
            {onPick && (
              <button
                type="button"
                onClick={onPick}
                disabled={!picked && !canPick}
                aria-pressed={picked}
                className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-40 ${
                  picked ? "bg-lime-300 text-zinc-950" : "bg-zinc-800 text-zinc-200"
                }`}
              >
                {picked ? <IconCheck size={16} /> : <IconPlus size={16} />}
                {picked ? t("rk.comparing") : t("rk.compare")}
              </button>
            )}
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-700 text-sm font-semibold text-zinc-200"
            >
              {t("rk.open")}
              <IconExternal size={16} />
            </a>
          </div>
          {onPick && !picked && !canPick && <p className="mt-2 text-xs text-zinc-500">{t("rk.compareMax")}</p>}
        </div>
      )}
    </div>
  );
}

/* Side by side. Columns are rackets, rows are what tells them apart; the best
   of each row is picked out, so the table reads at a glance. */
function CompareSheet({ rackets, onClose }: { rackets: RacketWithHistory[]; onClose: () => void }) {
  const { t } = usePadel();
  const f = useFormat();

  type Row = { label: string; values: (number | null)[]; show: (v: number) => string; best: "max" | "min" };
  const rows: Row[] = [
    { label: t("rk.compareRating"), values: rackets.map((r) => r.rating), show: (v) => v.toFixed(1), best: "max" },
    { label: t("rk.comparePrice"), values: rackets.map((r) => r.price), show: f.euro, best: "min" },
    ...AXES.map<Row>((k) => ({ label: t(`rk.${k}`), values: rackets.map((r) => r.ratings?.[k] ?? null), show: String, best: "max" })),
  ];

  return (
    <Sheet title={t("rk.compareTitle")} onClose={onClose} tall>
      <p className="mb-3 text-sm text-zinc-400">{t("rk.compareBest")}</p>
      <div className="-mx-4 overflow-x-auto px-4">
        <table className="w-full min-w-[20rem] table-fixed text-sm">
          <thead>
            <tr>
              <th className="w-24" />
              {rackets.map((r) => (
                <th key={r.slug} className="px-1 pb-3 align-top font-normal">
                  <span className="flex flex-col items-center gap-1.5 text-center">
                    <RacketImage racket={r} size={56} />
                    <span className="line-clamp-2 text-sm font-bold leading-tight">{r.name}</span>
                    <span className="text-xs text-zinc-500">{r.brand}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {rows.map((row) => {
              const known = row.values.filter((v): v is number => v !== null);
              const best = known.length > 1 ? (row.best === "max" ? Math.max(...known) : Math.min(...known)) : null;
              return (
                <tr key={row.label}>
                  <th scope="row" className="py-2.5 pr-2 text-left font-normal text-zinc-400">
                    {row.label}
                  </th>
                  {row.values.map((v, i) => (
                    <td
                      key={i}
                      className={`py-2.5 text-center tabular-nums ${v !== null && v === best ? "font-bold text-lime-300" : "text-zinc-200"}`}
                    >
                      {v === null ? "–" : row.show(v)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="py-2.5 pr-2 text-left font-normal text-zinc-400">
                {t("rk.compareShape")}
              </th>
              {rackets.map((r) => (
                <td key={r.slug} className="py-2.5 text-center text-zinc-200">
                  {r.shape ? t(`rk.shape.${r.shape}`) : "–"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <button type="button" onClick={onClose} className="mt-4 min-h-14 w-full rounded-2xl border border-zinc-800 font-semibold text-zinc-300">
        {t("share.close")}
      </button>
    </Sheet>
  );
}

const LEVELS = ["beginner", "intermediate", "advanced"] as const;
const STYLES = ["control", "balanced", "power"] as const;
const BUDGETS = [null, 100, 150, 200, 300] as const;

function FinderSheet({ onClose }: { onClose: () => void }) {
  const { t } = usePadel();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("intermediate");
  const [style, setStyle] = useState<(typeof STYLES)[number]>("balanced");
  const [budget, setBudget] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<RacketWithHistory[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const answer = useRef<HTMLDivElement>(null);

  // The answer lands below the fold on a phone; bring it up.
  useEffect(() => {
    if (results) answer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [results]);

  async function suggest() {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch("/api/padel/rackets/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, playStyle: style, ...(budget ? { budget } : {}) }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setResults(((await res.json()) as { rackets: RacketWithHistory[] }).rackets);
      setOpen(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const seg = (on: boolean) => `min-h-11 rounded-lg text-sm font-semibold ${on ? "bg-zinc-700 text-white" : "text-zinc-400"}`;

  return (
    <Sheet title={t("rk.finder")} onClose={onClose} tall>
      <p className="mb-4 text-sm text-zinc-400">{t("rk.finderHint")}</p>
      <Choice label={t("rk.level")}>
        {LEVELS.map((l) => (
          <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(l)} className={seg(level === l)}>
            {t(`rk.level.${l}`)}
          </button>
        ))}
      </Choice>
      <Choice label={t("rk.style")}>
        {STYLES.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => setStyle(s)} className={seg(style === s)}>
            {t(`rk.style.${s}`)}
          </button>
        ))}
      </Choice>
      <p className="mb-1.5 text-sm font-semibold text-zinc-400">{t("rk.budget")}</p>
      <div role="radiogroup" aria-label={t("rk.budget")} className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
        {BUDGETS.map((b) => (
          <button
            key={b ?? "any"}
            type="button"
            role="radio"
            aria-checked={budget === b}
            onClick={() => setBudget(b)}
            className={`min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold ${
              budget === b ? "border-lime-300 bg-lime-300 text-zinc-950" : "border-zinc-800 text-zinc-300"
            }`}
          >
            {b === null ? t("rk.budgetAny") : t("rk.price.upTo", { n: b })}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={suggest}
        disabled={busy}
        className="min-h-14 w-full rounded-2xl bg-lime-300 text-lg font-bold text-zinc-950 active:bg-lime-400 disabled:opacity-60"
      >
        {busy ? t("rk.suggesting") : t("rk.suggest")}
      </button>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-500/10 px-4 py-3 text-red-300">
          {t("rk.error")}
        </p>
      )}
      {results && (
        <div ref={answer} className="mt-5 scroll-mt-4" aria-live="polite">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{t("rk.suggestions")}</p>
          {results.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("rk.suggestNone")}</p>
          ) : (
            <ul className="space-y-2">
              {results.map((r) => (
                <li key={r.slug}>
                  <RacketCard racket={r} showSeason open={open === r.slug} onToggle={() => setOpen(open === r.slug ? null : r.slug)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-1.5 text-sm font-semibold text-zinc-400">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">
        {children}
      </div>
    </div>
  );
}
