"use client";

/* Page chrome shared by every LFP route: back link, wordmark, breadcrumb,
   and the persistent-but-discreet disclaimer. Kept deliberately plain so the
   content — and the one bold element per page — carries the personality. */

import Link from "next/link";

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
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--lfp-line)]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-3">
          <nav aria-label="Navegação" className="flex min-w-0 items-center gap-2 text-sm">
            <Link
              href="/"
              className="lfp-focus inline-flex min-h-11 shrink-0 items-center text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
            >
              ← Playground
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
            {crumbs.map((c) => (
              <span key={c.label} className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true" className="text-[var(--lfp-line-strong)]">
                  /
                </span>
                {c.href ? (
                  <Link
                    href={c.href}
                    className="lfp-focus inline-flex min-h-11 items-center truncate text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
                  >
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate font-medium">
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <span className="lfp-eyebrow hidden sm:inline">
            Informação pública · sem valor legal
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-16">{children}</main>

      <footer className="border-t border-[var(--lfp-line)]">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs leading-relaxed text-[var(--lfp-mist)]">
          Projeto educativo, construído a partir de informação pública.{" "}
          <strong className="font-semibold">Não tem valor legal</strong> e não substitui
          aconselhamento fiscal. Cada número indica o ano e a fonte.{" "}
          <Link
            href="/lfp/sobre"
            className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
          >
            Fontes e metodologia
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
