"use client";

/* Page chrome shared by every LFP route: back link, wordmark, breadcrumb,
   language toggle, and the persistent-but-discreet disclaimer. Kept plain so
   the content — and the one bold element per page — carries the personality. */

import Link from "next/link";
import { LangToggle } from "./LangToggle";
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
      <header className="border-b border-[var(--lfp-line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3">
          <nav aria-label="Navegação" className="flex min-w-0 items-center gap-2 text-sm">
            <Link
              href="/"
              className="lfp-focus inline-flex min-h-11 shrink-0 items-center text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
            >
              {c.nav.playground}
            </Link>
            <span aria-hidden="true" className="text-[var(--lfp-line-strong)]">
              /
            </span>
            {/* Negative margin keeps the visual gap while the padding widens
                the hit area — three letters are too narrow on their own. */}
            <Link
              href="/lfp"
              className="lfp-display lfp-focus -mx-2 inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 text-base font-semibold"
            >
              LFP
            </Link>
            {crumbs.map((crumb) => (
              <span key={crumb.label} className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="text-[var(--lfp-line-strong)]">
                  /
                </span>
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="lfp-focus inline-flex min-h-11 items-center truncate text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <span className="lfp-eyebrow hidden md:inline">{c.nav.eyebrow}</span>
            <LangToggle />
          </div>
        </div>
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
