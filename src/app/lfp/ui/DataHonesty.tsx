"use client";

/* The data-honesty primitives. Every published figure is traceable:
   what year it refers to, where it came from, and whether a human has
   actually checked it. These are small on purpose — they must be able to
   sit beside a number without shouting over it. */

import type { DatasetMeta } from "../types";
import { shortDate } from "../format";

/** The year a figure REFERS TO, not when it was fetched. Sits next to the
 *  number so a 2022 median can never masquerade as current. */
export function YearChip({ year, className }: { year: number; className?: string }) {
  return (
    // The visible chip is terse, but screen readers get a full phrase —
    // otherwise it runs straight into the preceding figure ("1500 €2026").
    <span
      className={`lfp-num ml-2 rounded border border-[var(--lfp-line)] px-1.5 py-0.5 align-middle text-[0.625rem] text-[var(--lfp-mist)] ${className ?? ""}`}
    >
      <span aria-hidden="true">{year}</span>
      <span className="sr-only">(valores de {year})</span>
    </span>
  );
}

export function SourceBadge({ meta }: { meta: DatasetMeta }) {
  return (
    <p className="text-xs leading-relaxed text-[var(--lfp-mist)]">
      Fonte:{" "}
      <a
        href={meta.source}
        target="_blank"
        rel="noopener noreferrer"
        className="lfp-focus underline underline-offset-2 hover:text-[var(--lfp-cobalt)]"
      >
        {meta.label}
      </a>{" "}
      · dados de {meta.year} · verificado em {shortDate(meta.lastVerified)}
    </p>
  );
}

/** Shown while any dataset is still unconfirmed. Deliberately loud: shipping
 *  invented-looking numbers without saying so would undermine everything
 *  else the project claims. */
export function UnverifiedBanner({
  datasets,
  missing = [],
}: {
  datasets: Array<{ id: string; unverified: boolean }>;
  missing?: string[];
}) {
  const pending = datasets.filter((d) => d.unverified).map((d) => d.id.toUpperCase());
  const absent = missing.map((m) => m.toUpperCase());
  const all = [...pending, ...absent];
  if (all.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-3"
    >
      <p className="text-sm font-semibold text-[var(--lfp-ouro)]">
        Valores por verificar
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">
        {absent.length > 0 && (
          <>Faltam dados de {absent.join(", ")}. </>
        )}
        {pending.length > 0 && (
          <>
            Os valores de {pending.join(", ")} ainda não foram confirmados nas fontes
            oficiais.{" "}
          </>
        )}
        Não uses estes números para decisões — trata-os como ilustração.
      </p>
    </div>
  );
}

/** The persistent, discreet disclaimer. Rendered inline on calculators, not
 *  buried in a footer, because someone landing straight on a calculator must
 *  see it too. */
export function Disclaimer({ notes }: { notes?: string[] }) {
  return (
    <div className="lfp-sunk px-4 py-3">
      <p className="text-xs leading-relaxed text-[var(--lfp-mist)]">
        Estimativa construída a partir de informação pública.{" "}
        <strong className="font-semibold text-[var(--lfp-cobalt-deep)]">
          Não tem valor legal
        </strong>{" "}
        e não substitui aconselhamento fiscal nem a tua declaração de IRS.
      </p>
      {notes && notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((n) => (
            <li
              key={n}
              className="flex gap-2 text-xs leading-relaxed text-[var(--lfp-mist)]"
            >
              <span aria-hidden="true">·</span>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
