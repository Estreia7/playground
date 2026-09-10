"use client";

/* Main navigation. Twenty-eight pages behind four branches, so the shape is
   a menubar of section triggers: hover or focus opens a panel of that
   branch's pages on desktop, and below `md` the whole thing collapses into
   one sheet.

   Built on plain buttons and links rather than a menu library: the panels
   are navigation, not a command menu, so links must stay links — openable
   in a new tab, crawlable, and usable with JavaScript still loading. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { tr } from "../i18n";
import type { Dict } from "../i18n";
import { useLfpLang } from "../useLfpLang";

type ItemKey = keyof Dict["chrome"]["nav"]["items"];
type SectionKey = keyof Dict["chrome"]["nav"]["sections"];

interface Section {
  key: SectionKey;
  /** The branch hub, when it has one. */
  href?: string;
  items: Array<{ key: ItemKey; href: string }>;
}

const SECTIONS: Section[] = [
  {
    key: "individual",
    href: "/lfp/individual",
    items: [
      { key: "salarioLiquido", href: "/lfp/individual/salario-liquido" },
      { key: "irs", href: "/lfp/individual/irs" },
      { key: "tsu", href: "/lfp/individual/tsu" },
      { key: "recibosVerdes", href: "/lfp/individual/recibos-verdes" },
      { key: "cenarios", href: "/lfp/individual/cenarios" },
    ],
  },
  {
    key: "empresarial",
    href: "/lfp/empresarial",
    items: [
      { key: "custoTrabalhador", href: "/lfp/empresarial/custo-trabalhador" },
      { key: "iva", href: "/lfp/empresarial/iva" },
      { key: "irc", href: "/lfp/empresarial/irc" },
    ],
  },
  {
    key: "economia",
    href: "/lfp/economia",
    items: [
      { key: "inflacao", href: "/lfp/economia/inflacao" },
      { key: "juros", href: "/lfp/economia/juros-compostos" },
      { key: "impostos", href: "/lfp/economia/impostos" },
      { key: "dias", href: "/lfp/economia/dias-de-trabalho" },
      { key: "aumento", href: "/lfp/economia/aumento" },
      { key: "situas", href: "/lfp/economia/onde-te-situas" },
      { key: "casa", href: "/lfp/economia/casa" },
      { key: "cesto", href: "/lfp/economia/recibo-de-iva" },
      { key: "vida", href: "/lfp/economia/vida" },
      { key: "orcamento", href: "/lfp/orcamento" },
    ],
  },
  {
    key: "aprender",
    items: [
      { key: "quiz", href: "/lfp/quiz" },
      { key: "mitos", href: "/lfp/mitos" },
      { key: "perfil", href: "/lfp/perfil" },
      { key: "sobre", href: "/lfp/sobre" },
      { key: "contribuir", href: "/lfp/contribuir" },
    ],
  },
];

/** The section a path belongs to, for the current-page marker. Longest
 *  prefix wins so /lfp/economia/casa marks Economia, not Individual. */
function sectionFor(pathname: string): SectionKey | null {
  let best: { key: SectionKey; len: number } | null = null;
  for (const s of SECTIONS) {
    for (const it of s.items) {
      if ((pathname === it.href || pathname.startsWith(it.href + "/")) && (!best || it.href.length > best.len)) {
        best = { key: s.key, len: it.href.length };
      }
    }
    if (s.href && (pathname === s.href || pathname.startsWith(s.href + "/")) && (!best || s.href.length > best.len)) {
      best = { key: s.key, len: s.href.length };
    }
  }
  return best?.key ?? null;
}

export function Nav() {
  const { t } = useLfpLang();
  const n = t.chrome.nav;
  const pathname = usePathname() ?? "";
  const current = sectionFor(pathname);

  const [open, setOpen] = useState<SectionKey | null>(null);
  const [sheet, setSheet] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const baseId = useId();

  // Close on Escape and on any click outside — the panel is transient, and
  // leaving it open over the page it covers would be worse than no panel.
  useEffect(() => {
    if (!open && !sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setSheet(false);
      }
    };
    // `pointerdown` fires BEFORE React's onClick, so a click on a trigger
    // would close the panel here and the trigger would then reopen it —
    // making the toggle look dead. Clicks inside the nav are left to the
    // handlers that own them.
    const onPointerDown = (e: PointerEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpen(null);
        setSheet(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, sheet]);

  // Any navigation closes everything, including a click on the page you are
  // already on.
  useEffect(() => {
    setOpen(null);
    setSheet(false);
  }, [pathname]);

  const isCurrent = (href: string) => pathname === href;

  const linkClass = (href: string) =>
    `lfp-focus block rounded-md px-3 py-2 text-sm transition-colors ${
      isCurrent(href)
        ? "bg-[var(--lfp-cobalt-faint)] font-medium text-[var(--lfp-cobalt-deep)]"
        : "text-[var(--lfp-mist)] hover:bg-[var(--lfp-cobalt-faint)] hover:text-[var(--lfp-cobalt-deep)]"
    }`;

  return (
    <nav ref={navRef} aria-label={n.menuLabel} className="flex min-w-0 items-center gap-1">
      {/* Desktop: a row of section triggers, each opening its own panel. */}
      <ul className="hidden items-center gap-0.5 md:flex">
        {SECTIONS.map((s) => {
          const panelId = `${baseId}-${s.key}`;
          const isOpen = open === s.key;
          // Click, not hover: a hover-opened panel is unreachable on touch,
          // and closing it on pointer-leave races the click that opened it.
          return (
            <li key={s.key} className="relative">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                aria-current={current === s.key ? "true" : undefined}
                onClick={() => setOpen((o) => (o === s.key ? null : s.key))}
                className={`lfp-focus inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${
                  current === s.key
                    ? "font-semibold text-[var(--lfp-cobalt-deep)]"
                    : "text-[var(--lfp-mist)] hover:text-[var(--lfp-cobalt)]"
                }`}
              >
                {n.sections[s.key]}
                <span
                  aria-hidden="true"
                  className={`text-[0.625rem] transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </button>
              {isOpen && (
                <div
                  id={panelId}
                  className="lfp-panel absolute left-0 top-full z-30 mt-1 w-64 p-1.5 shadow-lg"
                >
                  <ul>
                    {s.items.map((it) => (
                      <li key={it.key}>
                        <Link
                          href={it.href}
                          aria-current={isCurrent(it.href) ? "page" : undefined}
                          className={linkClass(it.href)}
                        >
                          {n.items[it.key]}
                        </Link>
                      </li>
                    ))}
                    {s.href && (
                      <li className="mt-1 border-t border-[var(--lfp-line)] pt-1">
                        <Link href={s.href} className={`${linkClass(s.href)} font-medium`}>
                          {tr(n.hubAll, { section: n.sections[s.key] })} →
                        </Link>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Mobile: one sheet with every section expanded — at this size a
          second level of tapping to reach a page is a tax, not a help. */}
      <button
        type="button"
        aria-expanded={sheet}
        aria-controls={`${baseId}-sheet`}
        onClick={() => setSheet((v) => !v)}
        className="lfp-focus lfp-press inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--lfp-line)] px-3 text-sm md:hidden"
      >
        <span aria-hidden="true" className="flex flex-col gap-[3px]">
          <span className="block h-px w-4 bg-current" />
          <span className="block h-px w-4 bg-current" />
          <span className="block h-px w-4 bg-current" />
        </span>
        {sheet ? n.close : n.open}
      </button>

      {sheet && (
        <div
          id={`${baseId}-sheet`}
          className="lfp-panel absolute left-0 right-0 top-full z-30 max-h-[70vh] overflow-y-auto p-4 shadow-lg md:hidden"
        >
          <Link href="/lfp" className={`${linkClass("/lfp")} font-medium`}>
            {n.home}
          </Link>
          {SECTIONS.map((s) => (
            <section key={s.key} className="mt-4 first:mt-2">
              <p className="lfp-eyebrow px-3">{n.sections[s.key]}</p>
              <ul className="mt-1">
                {s.items.map((it) => (
                  <li key={it.key}>
                    <Link
                      href={it.href}
                      aria-current={isCurrent(it.href) ? "page" : undefined}
                      className={`${linkClass(it.href)} min-h-11 leading-7`}
                    >
                      {n.items[it.key]}
                    </Link>
                  </li>
                ))}
                {s.href && (
                  <li>
                    <Link href={s.href} className={`${linkClass(s.href)} min-h-11 font-medium leading-7`}>
                      {tr(n.hubAll, { section: n.sections[s.key] })} →
                    </Link>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
      )}
    </nav>
  );
}
