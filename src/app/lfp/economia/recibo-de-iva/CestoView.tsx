"use client";

import { useMemo, useState } from "react";
import { cestoIva } from "../../calc";
import { eur, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { NumberField } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { IvaTipo } from "../../types";

interface Row {
  id: number;
  key: string;
  tipo: IvaTipo;
  amount: number;
}

/** A plausible weekly shop, using the dataset's own example items. */
const DEFAULT_PRICES: Record<string, number> = {
  pao: 3.2,
  leite: 4.5,
  medicamentos: 12,
  livros: 15,
  restauracao: 24,
  vinho: 6.5,
  conservas: 5,
  eletrodomesticos: 89,
  vestuario: 45,
  combustivel: 60,
};

const TIPOS: IvaTipo[] = ["reduzida", "intermedia", "normal"];
const TONE: Record<IvaTipo, string> = {
  normal: "var(--lfp-tone-iva)",
  intermedia: "var(--lfp-tone-irc)",
  reduzida: "var(--lfp-tone-servico)",
};

export default function CestoView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.sec.cesto;
  const iva = data?.iva;

  const [rows, setRows] = useState<Row[] | null>(null);
  const [nextId, setNextId] = useState(1000);

  // Seeded from the dataset's examples once it arrives.
  const items = useMemo<Row[]>(() => {
    if (rows) return rows;
    if (!iva) return [];
    return iva.examples.map((ex, i) => ({ id: i, key: ex.key, tipo: ex.tipo, amount: DEFAULT_PRICES[ex.key] ?? 10 }));
  }, [rows, iva]);

  const result = useMemo(() => (iva ? cestoIva(items, { iva }) : null), [iva, items]);

  const update = (id: number, patch: Partial<Row>) => setRows(items.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: number) => setRows(items.filter((r) => r.id !== id));
  const add = () => {
    setRows([...items, { id: nextId, key: "", tipo: "normal", amount: 10 }]);
    setNextId((n) => n + 1);
  };

  const money = (n: number) => eur(n, lang);
  const label = (r: Row) => (r.key ? (t.empresarial.iva.examples as Record<string, string>)[r.key] ?? r.key : c.fields.custom);
  const rates = iva?.rates.continente;

  return (
    <Shell crumbs={[{ href: "/lfp/economia", label: t.economia.hub.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
        </div>
      )}
      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {iva && rates && result && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-3 p-5" aria-label={c.formAria}>
            {items.map((r) => (
              <fieldset key={r.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_6.5rem_2.75rem] items-end gap-2 border-b border-[var(--lfp-line)] pb-3 last:border-0">
                <legend className="sr-only">{label(r)}</legend>
                <div className="min-w-0">
                  <label htmlFor={`ci-tipo-${r.id}`} className="block truncate text-sm font-medium">{label(r)}</label>
                  <select
                    id={`ci-tipo-${r.id}`}
                    value={r.tipo}
                    onChange={(e) => update(r.id, { tipo: e.target.value as IvaTipo })}
                    aria-label={`${label(r)} · ${c.fields.tipo}`}
                    className="lfp-input lfp-focus mt-1.5 h-11 w-full px-2 text-sm"
                  >
                    {TIPOS.map((tp) => (
                      <option key={tp} value={tp}>
                        {c.tipos[tp]} {pct(rates[tp], lang, 0)}
                      </option>
                    ))}
                  </select>
                </div>
                <NumberField label={c.fields.amount} value={r.amount} onChange={(n) => update(r.id, { amount: n })} min={0} max={100000} step={0.1} />
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label={`${c.fields.remove}: ${label(r)}`}
                  className="lfp-focus lfp-press h-11 w-11 rounded-lg border border-[var(--lfp-line)] text-lg text-[var(--lfp-mist)] transition-colors hover:border-[var(--lfp-vermelho)] hover:text-[var(--lfp-vermelho)]"
                >
                  ×
                </button>
              </fieldset>
            ))}
            <button type="button" onClick={add} className="lfp-focus lfp-press min-h-11 w-full rounded-lg border border-dashed border-[var(--lfp-line-strong)] text-sm font-medium text-[var(--lfp-cobalt)] hover:border-[var(--lfp-cobalt)]">
              + {c.fields.add}
            </button>
          </form>

          <div className="min-w-0 space-y-6 lg:sticky lg:top-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {tr(c.headline.eyebrow, { total: money(result.total) })}
                <YearChip year={iva.meta.year} />
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num lfp-state">{money(result.iva)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--lfp-line)] pt-4 text-sm">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{tr(c.headline.share, { pct: "" }).trim()}</dt>
                  <dd className="lfp-num font-semibold">{pct(result.pesoIva, lang)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.semIva}</dt>
                  <dd className="lfp-num font-semibold lfp-keep">{money(result.semIva)}</dd>
                </div>
              </dl>
            </div>

            <div className="lfp-panel p-5">
              <h2 className="text-sm font-semibold">{c.bar.title}</h2>
              <div
                role="img"
                aria-label={tr(c.bar.aria, {
                  total: money(result.total),
                  normal: money(result.porTipo.normal.comIva),
                  intermedia: money(result.porTipo.intermedia.comIva),
                  reduzida: money(result.porTipo.reduzida.comIva),
                })}
                className="mt-3 flex h-6 w-full overflow-hidden rounded-md bg-[var(--lfp-cal)]"
              >
                {TIPOS.map((tp) =>
                  result.total > 0 && result.porTipo[tp].comIva > 0 ? (
                    <div key={tp} style={{ width: `${(result.porTipo[tp].comIva / result.total) * 100}%`, background: TONE[tp] }} />
                  ) : null
                )}
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                {TIPOS.map((tp) => (
                  <li key={tp} className="flex items-center gap-2">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: TONE[tp] }} />
                    <span>{c.tipos[tp]} · {pct(rates[tp], lang, 0)}</span>
                    <span className="lfp-num text-[var(--lfp-mist)]">{money(result.porTipo[tp].comIva)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <Ledger caption={c.ledger.caption}>
              {TIPOS.map((tp) => (
                <LedgerRow key={tp} label={tr(c.ledger.row, { tipo: c.tipos[tp], rate: pct(rates[tp], lang, 0) })} value={money(result.porTipo[tp].iva)} tone="state" />
              ))}
              <LedgerRow label={c.ledger.base} value={money(result.semIva)} tone="keep" />
              <LedgerRow label={c.ledger.iva} value={money(result.iva)} strong tone="state" />
              <LedgerRow label={c.ledger.total} value={money(result.total)} strong />
            </Ledger>

            <Disclaimer
              notes={c.notes.map((n) =>
                tr(n, { normal: pct(rates.normal, lang, 0), intermedia: pct(rates.intermedia, lang, 0), reduzida: pct(rates.reduzida, lang, 0) })
              )}
            />
            <SourceBadge meta={iva.meta} />
          </div>
        </div>
      )}
    </Shell>
  );
}
