"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/crypto", label: "Overview" },
  { href: "/crypto/chart", label: "Chart" },
  { href: "/crypto/cycles", label: "Cycles" },
  { href: "/crypto/stad", label: "BTC STAD" },
  { href: "/crypto/xrp-flow", label: "XRP Flow" },
  { href: "/crypto/nupl", label: "NUPL" },
];

export function CryptoNav() {
  const path = usePathname();
  return (
    <header className="cx-top">
      <Link href="/crypto" className="cx-brand" aria-label="Crypto Desk overview">
        <Mark />
        <b>Crypto Desk</b>
      </Link>
      <nav className="cx-tabs" aria-label="Crypto Desk sections">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className="cx-tab" aria-current={path === t.href ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Link href="/" className="cx-back">
        ← Playground
      </Link>
    </header>
  );
}

/* Three candles climbing out of a dip: the cycle, drawn as the thing it is. */
function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="0.5" y="0.5" width="21" height="21" rx="5.5" fill="#171b21" stroke="#2a3039" />
      <line x1="6" y1="8" x2="6" y2="16" stroke="#f23645" strokeWidth="1.2" />
      <rect x="4.5" y="10" width="3" height="4" rx="0.6" fill="#f23645" />
      <line x1="11" y1="9" x2="11" y2="17" stroke="#22ab94" strokeWidth="1.2" />
      <rect x="9.5" y="11" width="3" height="4.5" rx="0.6" fill="#22ab94" />
      <line x1="16" y1="4" x2="16" y2="13" stroke="#9b8afb" strokeWidth="1.2" />
      <rect x="14.5" y="5.5" width="3" height="6" rx="0.6" fill="#9b8afb" />
    </svg>
  );
}
