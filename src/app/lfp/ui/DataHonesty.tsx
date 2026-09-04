"use client";

/* The data-honesty primitives. Every published figure is traceable:
   what year it refers to, where it came from, and whether a human has
   actually checked it. These are small on purpose — they must be able to
   sit beside a number without shouting over it. */

import type { DatasetMeta } from "../types";
import { shortDate } from "../format";
import { tr } from "../i18n";
import { useLfpLang } from "../useLfpLang";

/** The year a figure REFERS TO, not when it was fetched. Sits next to the
 *  number so a 2022 median can never masquerade as current. */
export function YearChip({ year, className }: { year: number; className?: string }) {
  const { t } = useLfpLang();
  return (
    // The visible chip is terse, but screen readers get a full phrase —
    // otherwise it runs straight into the preceding figure ("1500 €2026").
    <span
      className={`lfp-num ml-2 rounded border border-[var(--lfp-line)] px-1.5 py-0.5 align-middle text-[0.625rem] text-[var(--lfp-mist)] ${className ?? ""}`}
    >
      <span aria-hidden="true">{year}</span>
      <span className="sr-only">{tr(t.chrome.honesty.yearChip, { year })}</span>
    </span>
  );
}

export function SourceBadge({ meta }: { meta: DatasetMeta }) {
  const { t, lang } = useLfpLang();
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs leading-relaxed text-[var(--lfp-mist)]">
      <span>{t.chrome.honesty.source}</span>
      {/* A chip, not an inline link: it needs a 44px hit area, and stretching
          the surrounding sentence to get one would look broken. */}
      <a
        href={meta.source}
        target="_blank"
        rel="noopener noreferrer"
        className="lfp-focus inline-flex min-h-11 items-center rounded-md border border-[var(--lfp-line)] px-2.5 font-medium text-[var(--lfp-cobalt)] underline underline-offset-2 transition-colors hover:border-[var(--lfp-cobalt)]"
      >
        {meta.label}
      </a>
      <span>
        {tr(t.chrome.honesty.dataOf, {
          year: meta.year,
          date: shortDate(meta.lastVerified, lang),
        })}
      </span>
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
  const { t } = useLfpLang();
  const h = t.chrome.honesty;
  const pending = datasets.filter((d) => d.unverified).map((d) => d.id.toUpperCase());
  const absent = missing.map((m) => m.toUpperCase());
  if (pending.length + absent.length === 0) return null;

  return (
    <div
      role="status"
      className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-3"
    >
      <p className="text-sm font-semibold text-[var(--lfp-ouro)]">{h.unverifiedTitle}</p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">
        {absent.length > 0 && <>{tr(h.unverifiedMissing, { list: absent.join(", ") })} </>}
        {pending.length > 0 && <>{tr(h.unverifiedPending, { list: pending.join(", ") })} </>}
        {h.unverifiedAdvice}
      </p>
    </div>
  );
}

/** The persistent, discreet disclaimer. Rendered inline on calculators, not
 *  buried in a footer, because someone landing straight on a calculator must
 *  see it too. Notes arrive already translated by the caller. */
export function Disclaimer({ notes }: { notes?: readonly string[] }) {
  const { t } = useLfpLang();
  const h = t.chrome.honesty;
  return (
    <div className="lfp-sunk px-4 py-3">
      {/* Body text in cobalt-deep: --lfp-mist clears 4.5:1 on the cal and
          tile grounds but not on this darker sunk panel. */}
      <p className="text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">
        {h.disclaimerLead} <strong className="font-semibold">{h.disclaimerNoLegal}</strong>{" "}
        {h.disclaimerTail}
      </p>
      {notes && notes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {notes.map((n) => (
            <li
              key={n}
              className="flex gap-2 text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]"
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
