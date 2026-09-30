"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePadel } from "./PadelProvider";
import { IconBars, IconRacket, IconTrophy, Medal } from "./art";

/* Small shared pieces. Everything is sized for a thumb: 48px touch targets,
   16px+ text, numbers in tabular figures so columns of scores line up. */

export function LangToggle() {
  const { lang, setLang } = usePadel();
  return (
    <div className="flex rounded-lg border border-zinc-800 p-0.5 text-xs font-semibold">
      {(["pt", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`min-h-9 rounded-md px-2.5 uppercase ${lang === l ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function TopBar({
  title,
  back,
  right,
  icon,
}: {
  title: string;
  back?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const { t } = usePadel();
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-900 bg-zinc-950/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-2 px-4">
        {back && (
          <Link
            href={back}
            aria-label={t("back")}
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-zinc-400 active:bg-zinc-900"
          >
            ‹
          </Link>
        )}
        {icon}
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{title}</h1>
        {right}
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t } = usePadel();
  const path = usePathname();
  const items = [
    { href: "/padel", label: t("nav.tournaments"), icon: <IconRacket size={24} />, active: path === "/padel" || path.startsWith("/padel/t") },
    { href: "/padel/ranking", label: t("nav.ranking"), icon: <IconTrophy size={24} />, active: path.startsWith("/padel/ranking") },
    { href: "/padel/stats", label: t("nav.stats"), icon: <IconBars size={24} />, active: path.startsWith("/padel/stats") },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-900 bg-zinc-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-xl">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
              it.active ? "text-lime-300" : "text-zinc-500"
            }`}
          >
            <span className="relative flex h-7 items-center" aria-hidden>
              {it.icon}
              {it.active && (
                <span
                  key={path}
                  className="pd-pop absolute -right-1.5 -top-0.5 h-2 w-2 rounded-full bg-lime-300"
                />
              )}
            </span>
            {it.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Page body with room for the bottom nav. */
export function Page({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <main className={`mx-auto max-w-xl px-4 pt-4 ${nav ? "pb-28" : "pb-10"}`}>{children}</main>
  );
}

export function Loading() {
  const { t, loadError, reload } = usePadel();
  if (loadError) {
    return (
      <div className="py-16 text-center">
        <p className="text-zinc-400">{t("error.load")}</p>
        <button onClick={reload} className="mt-4 min-h-12 rounded-xl bg-zinc-800 px-5 font-semibold">
          {t("retry")}
        </button>
      </div>
    );
  }
  return <p className="py-16 text-center text-zinc-500">{t("loading")}</p>;
}

export function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  const { t } = usePadel();
  const btn =
    "flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 text-2xl font-bold active:bg-zinc-700 disabled:opacity-30";
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={t("stepper.less")}>
        −
      </button>
      <span className="min-w-10 text-center text-2xl font-bold tabular-nums">{value}</span>
      <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={t("stepper.more")}>
        +
      </button>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500">{title}</h2>
        {aside && <span className="text-sm text-zinc-500">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/** A finishing place: a drawn medal for the top three, the number after that. */
export function Place({ place, size = 26 }: { place: number; size?: number }) {
  if (place >= 1 && place <= 3) return <Medal place={place as 1 | 2 | 3} size={size} />;
  return (
    <span className="inline-flex items-center justify-center tabular-nums text-zinc-500" style={{ width: size, height: size }}>
      {place}
    </span>
  );
}
