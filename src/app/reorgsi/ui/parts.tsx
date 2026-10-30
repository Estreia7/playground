"use client";

import { useEffect, useRef } from "react";
import type { Db, Deal, DealStatus, InvoiceStatus, Party, Prize } from "../core/types.ts";
import { docProgress, requirementsFor } from "../core/commission.ts";
import { IconClose } from "./Icons.tsx";
import type { LabelledFile } from "./files/Files.tsx";
import { PHASE_LABEL } from "../core/types.ts";
import { initials } from "./format.ts";

/* Small pieces shared by several screens. */

/** The document bar: one segment per required document that applies. */
export function DocBar({ db, deal, large = false, showLabel = true }: { db: Db; deal: Deal; large?: boolean; showLabel?: boolean }) {
  const reqs = requirementsFor(deal, db.docRequirements).filter((r) => r.required && deal.documents[r.id]?.state !== "na");
  const p = docProgress(deal, db.docRequirements);
  if (reqs.length === 0) return <span className="rs-docbar-label">Sem documentos obrigatórios</span>;
  const summary =
    p.done === p.total
      ? p.unfiled
        ? `Completo · ${p.unfiled} sem ficheiro`
        : "Completo"
      : `${p.done} de ${p.total}` + (p.missing ? ` · ${p.missing} em falta` : "");
  return (
    <div style={{ minWidth: large ? undefined : 120 }}>
      <div
        className={`rs-docbar ${large ? "lg" : ""}`}
        role="img"
        aria-label={`Documentos: ${summary}. ${reqs.map((r) => `${r.name}: ${deal.documents[r.id]?.state ?? "por carregar"}`).join("; ")}`}
      >
        {reqs.map((r) => (
          <span key={r.id} className={`seg ${deal.documents[r.id]?.state ?? ""}`} title={r.name} />
        ))}
      </div>
      {showLabel && <div className="rs-docbar-label num">{summary}</div>}
    </div>
  );
}

export function DealStatusPill({ status }: { status: DealStatus }) {
  if (status === "concluido") return <span className="rs-pill jade">Concluído</span>;
  if (status === "anulado") return <span className="rs-pill red">Anulado</span>;
  return <span className="rs-pill teal">Em curso</span>;
}

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  if (status === "paga") return <span className="rs-pill jade">Paga</span>;
  if (status === "anulada") return <span className="rs-pill red">Anulada</span>;
  return <span className="rs-pill amber">Por pagar</span>;
}

export function PartyLabel({ db, party }: { db: Db; party?: Party }) {
  if (!party) return <span style={{ color: "var(--faint)" }}>—</span>;
  if (party.kind === "external") {
    return (
      <span className="whitespace-nowrap">
        <span style={{ color: "var(--muted)" }}>{party.name}</span>
        {party.note && <span className="rs-sub">{party.note}</span>}
      </span>
    );
  }
  // The manager's own consultants stand out as a jade chip; outsiders stay plain grey.
  const name = db.consultants.find((c) => c.id === party.consultantId)?.name ?? "—";
  return (
    <span className="whitespace-nowrap">
      <span className="rs-person" title="Consultor da equipa">
        <span className="av" aria-hidden="true">
          {initials(name)}
        </span>
        {name}
      </span>
      {party.note && <span className="rs-sub">{party.note}</span>}
    </span>
  );
}

/* Prize tiers keep the colours of their names, toned to sit with the palette. */
const PRIZE_TONES: Record<string, { bg: string; fg: string; dot: string }> = {
  CENTURION: { bg: "#f3ead6", fg: "#6b4d12", dot: "#c9a35c" },
  EMERALD: { bg: "#dcefe4", fg: "#1d5e45", dot: "#2f8a63" },
  RUBY: { bg: "#f6e0e4", fg: "#8a2a3d", dot: "#b8435a" },
};

/** "Ruby 25": the prize and the year it was won for. */
export function PrizeChip({ prize }: { prize: Prize }) {
  const key = prize.name.toUpperCase();
  const tone = PRIZE_TONES[key] ?? { bg: "var(--canvas)", fg: "var(--ink-2)", dot: "var(--teal)" };
  const label = key.charAt(0) + key.slice(1).toLowerCase();
  return (
    <span
      className="rs-pill"
      style={{ background: tone.bg, color: tone.fg }}
      title={`${label} ${prize.year}`}
      aria-label={`Prémio ${label} ${prize.year}`}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: tone.dot }} aria-hidden="true" />
      {label} {prize.year.slice(-2)}
    </span>
  );
}

const MEDALS = ["#c9a35c", "#9fb3b8", "#b9825a"]; // gold, silver, bronze

/** Ranking position, "1º", "2º"… with a medal before the first three. */
export function Rank({ n }: { n: number }) {
  const medal = MEDALS[n - 1];
  return (
    <span className="inline-flex min-w-11 items-center gap-1 whitespace-nowrap font-semibold" aria-label={`${n}.º lugar`}>
      {medal ? (
        <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
          <path d="M4 0h3l1.5 5L10 0h2L9.6 7H6.4z" fill="#345b63" fillOpacity="0.55" />
          <circle cx="8" cy="11.5" r="5.5" fill={medal} />
          <circle cx="8" cy="11.5" r="3.6" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1" />
        </svg>
      ) : (
        <span className="inline-block w-4" aria-hidden="true" />
      )}
      <span style={{ color: medal ? "var(--ink)" : "var(--muted)" }}>{n}º</span>
    </span>
  );
}

/** Every file attached to a deal, in reading order, for the lightbox. */
export function dealFiles(db: Db, deal: Deal): LabelledFile[] {
  const out: LabelledFile[] = [];
  if (deal.listingShot) out.push({ file: deal.listingShot, label: `Anúncio · ${deal.ref || deal.address}` });
  for (const r of requirementsFor(deal, db.docRequirements)) {
    const f = deal.documents[r.id]?.file;
    if (f) out.push({ file: f, label: `${r.name} · ${deal.ref || deal.address}` });
  }
  for (const inv of db.invoices.filter((i) => i.dealId === deal.id)) {
    if (inv.file) out.push({ file: inv.file, label: `Fatura ${inv.number} · ${PHASE_LABEL[inv.phase]}` });
  }
  return out;
}

/** A side panel for forms. Escape or the backdrop closes it; focus starts on
 *  the first field and returns where it was. */
export function Panel({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      returnTo?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="rs-panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="rs-panel" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" data-close className="rs-btn ghost sm ml-auto" onClick={onClose} aria-label="Fechar">
            <IconClose size={18} />
          </button>
        </header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

/** Number input that holds text while typing and accepts "2 562,50". */
export function parseNumber(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(/[€\s  ]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export function numberText(n: number | undefined): string {
  return n == null ? "" : String(n).replace(".", ",");
}
