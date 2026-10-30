"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { useReorg } from "./App.tsx";
import { initials } from "./format.ts";
import { IconChart, IconHome, IconKey, IconLedger, IconMenu, IconPeople, IconSettings, Mark } from "./Icons.tsx";

/* The frame around every screen. Every link stays inside /reorgsi: once in,
   the only way out is to sign out or close the tab. */

const NavContext = createContext<() => void>(() => undefined);

export function Shell({ children }: { children: React.ReactNode }) {
  const { db, logout } = useReorg();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
