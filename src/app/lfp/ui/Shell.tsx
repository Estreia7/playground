"use client";

/* Page chrome shared by every LFP route: back link, wordmark, breadcrumb,
   language toggle, and the persistent-but-discreet disclaimer. Kept plain so
   the content — and the one bold element per page — carries the personality. */

import Link from "next/link";
import { LangToggle } from "./LangToggle";
import { Nav } from "./Nav";
import { useLfpLang } from "../useLfpLang";

export interface Crumb {
  href?: string;
  label: string;
}

export function Shell({
  crumbs = [],
  children,
}: {
  crumbs?: Crumb[];
  children: React.ReactNode;
}) {
  const { t } = useLfpLang();
  const c = t.chrome;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-[var(--lfp-line)] bg-[var(--lfp-cal)]/95 backdrop-blur">
        {/* `relative` anchors the mobile nav sheet, which spans the header. */}
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-6 py-2.5">
          {/* Negative margin keeps the visual gap while the padding widens
              the hit area — three letters are too narrow on their own. */}
          <Link
            href="/lfp"
            className="lfp-display lfp-focus -mx-2 inline-flex min-h-11 shrink-0 items-center justify-center px-2 text-base font-semibold"
          >
            LFP
          </Link>
          <Nav />
          <div className="ml-auto flex items-center gap-3">
            <span className="lfp-eyebrow hidden lg:inline">{c.nav.eyebrow}</span>
            <LangToggle />
          </div>
        </div>

        {/* The trail stays, one line down: the nav says where you can go,
            the breadcrumb says where you are. */}
        {crumbs.length > 0 && (
          <div className="border-t border-[var(--lfp-line)]">
            <nav
              aria-label={c.nav.trailLabel}
              className="mx-auto flex max-w-6xl items-center gap-2 overflow-x-auto px-6 text-xs"
            >
              <Link href="/lfp" className="lfp-focus inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]">
                {c.nav.home}
              </Link>
              {crumbs.map((crumb) => (
                <span key={crumb.label} className="flex min-w-0 items-center gap-2">
                  <span aria-hidden="true" className="text-[var(--lfp-line-strong)]">/</span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="lfp-focus inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded px-2 text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="inline-flex min-h-11 items-center truncate px-1 font-medium">
                      {crumb.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">{children}</main>

      <footer className="border-t border-[var(--lfp-line)]">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs leading-relaxed text-[var(--lfp-mist)]">
          {c.footer.lead} <strong className="font-semibold">{c.footer.noLegal}</strong>{" "}
          {c.footer.tail}{" "}
          <Link
            href="/lfp/sobre"
            className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
          >
            {c.footer.sources}
          </Link>
        </div>
      </footer>
    </div>
  );
}

/** Page header block: eyebrow, display title, lede. */
export function PageIntro({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
}) {
  return (
    <section className="pt-10 pb-6 sm:pt-14">
      <p className="lfp-eyebrow mb-3">{eyebrow}</p>
      <h1 className="lfp-display max-w-3xl text-[2.125rem] font-semibold sm:text-5xl">
        {title}
      </h1>
      {lede && (
        <p className="mt-4 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--lfp-mist)]">
          {lede}
        </p>
      )}
    </section>
  );
}
