"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useReorg } from "./App.tsx";
import { initials } from "./format.ts";
import { useTrackVisits } from "./nav.tsx";
import { IconChart, IconHome, IconKey, IconLedger, IconMenu, IconPeople, IconSettings, Mark } from "./Icons.tsx";

/* The frame around every screen. Every link stays inside /reorgsi: once in,
   the only way out is to sign out or close the tab. */

const NavContext = createContext<() => void>(() => undefined);

export function Shell({ children }: { children: React.ReactNode }) {
  const { db, logout } = useReorg();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useTrackVisits();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const active = db.consultants.filter((c) => c.status !== "inativo").length;
  const openDeals = db.deals.filter((d) => d.status === "aberto").length;

  const items = [
    { href: "/reorgsi", label: "Início", icon: <IconHome />, exact: true },
    { href: "/reorgsi/negocios", label: "Negócios", icon: <IconKey />, count: openDeals },
    { href: "/reorgsi/consultores", label: "Consultores", icon: <IconPeople />, count: active },
    { href: "/reorgsi/analises", label: "Análises", icon: <IconChart /> },
    { href: "/reorgsi/conta-corrente", label: "Conta corrente", icon: <IconLedger /> },
  ];

  const isCurrent = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));

  return (
    <NavContext.Provider value={() => setOpen(true)}>
      <div className="rs-shell">
        <aside className="rs-side" data-open={open} aria-label="Navegação">
          <div className="rs-brand">
            <Mark size={34} />
            <div>
              ReorgSI
              <small>Direção Comercial</small>
            </div>
          </div>
          <nav className="rs-nav flex flex-col gap-0.5">
            {items.map((it) => (
              <Link key={it.href} href={it.href} aria-current={isCurrent(it.href, it.exact) ? "page" : undefined}>
                {it.icon}
                {it.label}
                {it.count != null && <span className="count num">{it.count}</span>}
              </Link>
            ))}
            <p className="rs-nav-group">Gestão</p>
            <Link href="/reorgsi/configuracao" aria-current={isCurrent("/reorgsi/configuracao") ? "page" : undefined}>
              <IconSettings />
              Configuração
            </Link>
          </nav>
          <div className="rs-me">
            <span
              className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-xs font-bold"
              style={{ background: "#d4ecdd", color: "#112031" }}
              aria-hidden="true"
            >
              {initials(db.settings.managerName)}
            </span>
            <span className="min-w-0 truncate text-white">{db.settings.managerName}</span>
            <button type="button" onClick={logout}>
              Sair
            </button>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />}
        <main className="rs-main">{children}</main>
        <TabBar isCurrent={isCurrent} onMore={() => setOpen(true)} moreOpen={open} />
      </div>
    </NavContext.Provider>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  const openNav = useContext(NavContext);
  return (
    <header className="rs-top">
      <button type="button" className="rs-btn ghost rs-burger" onClick={openNav} aria-label="Abrir menu">
        <IconMenu />
      </button>
      <div className="min-w-0">
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

/* Phone navigation: a floating bar of frosted glass at the bottom of the
   screen. The current page sits in a teal bubble that slides, with a little
   overshoot, to whichever tab is tapped. The gear opens the full menu
   (Consultores, Configuração, Sair), and is the current tab on those pages. */

// Início sits in the middle, under the thumb.
const TABS = [
  { href: "/reorgsi/negocios", label: "Negócios", icon: IconKey },
  { href: "/reorgsi/analises", label: "Análises", icon: IconChart },
  { href: "/reorgsi", label: "Início", icon: IconHome, exact: true },
  { href: "/reorgsi/conta-corrente", label: "Conta corrente", icon: IconLedger },
];

function TabBar({
  isCurrent,
  onMore,
  moreOpen,
}: {
  isCurrent: (href: string, exact?: boolean) => boolean;
  onMore: () => void;
  moreOpen: boolean;
}) {
  const found = TABS.findIndex((t) => isCurrent(t.href, t.exact));
  const index = moreOpen || found < 0 ? TABS.length : found;
  return (
    <nav className="rs-tabbar" aria-label="Navegação principal" style={{ ["--i" as string]: index }}>
      <span className="bubble" aria-hidden="true" />
      {TABS.map((t, i) => {
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href} className="tab" aria-label={t.label} aria-current={i === found ? "page" : undefined} data-on={i === index}>
            <Icon size={20} />
          </Link>
        );
      })}
      <button type="button" className="tab" aria-label="Mais: consultores, configuração e sair" aria-expanded={moreOpen} data-on={index === TABS.length} onClick={onMore}>
        <IconSettings size={20} />
      </button>
    </nav>
  );
}
