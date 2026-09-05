"use client";

/* The withholding tables, with a salary field that highlights the row you
   fall in and proves the bracket myth false with your own numbers: put in
   the bracket ceiling, then one euro more — net pay goes up. */

import { useEffect, useMemo, useState } from "react";
import { salarioLiquido } from "../calc";
import { eur, eur0, pct } from "../format";
import { tr } from "../i18n";
import type { IrsDataset, TsuDataset } from "../types";
import { NumberField } from "../ui/Inputs";
import { YearChip } from "../ui/DataHonesty";
import { useLfpLang } from "../useLfpLang";

const NO_SUB = { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 };

export function BracketTable({
  irs,
  tsu,
  initialBruto,
}: {
  irs: IrsDataset;
  tsu: TsuDataset;
  /** Arrives after mount when it comes from the URL, so it is applied in an effect. */
  initialBruto?: number;
}) {
  const { t, lang } = useLfpLang();
  const c = t.explainers.common;
  const [bruto, setBruto] = useState(initialBruto ?? 1500);

  useEffect(() => {
    if (initialBruto !== undefined) setBruto(initialBruto);
  }, [initialBruto]);

  const net = (b: number) =>
    salarioLiquido(
      {
        brutoMensal: b,
        meses: 14,
        situacao: "nao_casado",
        dependentes: 0,
        regiao: "continente",
        subsidioRefeicao: NO_SUB,
      },
      { irs, tsu }
    );

  const result = useMemo(() => net(bruto), [bruto, irs, tsu]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = irs.retencao.find(
    (x) => x.situacao === "nao_casado" && x.regiao === "continente"
  );
  const rows = table?.rows ?? [];
  const active = result.escalaoAplicado;

  // The proof: the ceiling of the active bracket, and one euro over it.
  const ceiling = active?.upTo ?? null;
  const proof =
    ceiling !== null
      ? { below: ceiling, above: ceiling + 1, netBelow: net(ceiling), netAbove: net(ceiling + 1) }
      : null;

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const annual = irs.escaloes.continente ?? [];

  return (
    <div className="lfp-panel overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--lfp-line)] px-5 py-4">
        <h3 className="text-sm font-semibold">
          {c.bracketsTitle}
          <YearChip year={irs.meta.year} />
        </h3>
        <div className="w-full max-w-[14rem]">
          <NumberField label={c.bracketsSalary} value={bruto} onChange={setBruto} min={0} max={100000} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--lfp-line)]">
              <th scope="col" className="lfp-eyebrow px-5 py-2 text-left font-normal">
                {c.bracketsUpTo}
              </th>
              <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">
                {c.bracketsMarginal}
              </th>
              <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">
                {c.bracketsParcela}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isActive = active !== null && r.upTo === active.upTo;
              return (
                <tr
                  key={i}
                  aria-current={isActive ? "true" : undefined}
                  className={`border-b border-[var(--lfp-line)] last:border-0 ${
                    isActive ? "bg-[var(--lfp-cobalt-faint)]" : ""
                  }`}
                >
                  <th scope="row" className="lfp-num px-5 py-2 text-left font-normal">
                    {r.upTo === null ? `${c.bracketsAbove} ${money0(rows[i - 1]?.upTo ?? 0)}` : money0(r.upTo)}
                    {isActive && (
                      <span className="lfp-eyebrow ml-2 text-[var(--lfp-cobalt)]">
                        ← {c.bracketsYours}
                      </span>
                    )}
                  </th>
                  <td className={`lfp-num px-5 py-2 text-right ${isActive ? "font-semibold" : ""}`}>
                    {pct(r.taxaMarginalMaxima, lang)}
                  </td>
                  <td className="lfp-num whitespace-nowrap px-5 py-2 text-right text-[var(--lfp-mist)]">
                    {r.parcelaAbaterFormula ? (
                      <span
                        title={`${pct(r.taxaMarginalMaxima, lang)} × ${r.parcelaAbaterFormula.factor} × (${money(r.parcelaAbaterFormula.limite)} − R)`}
                        className="rounded border border-[var(--lfp-line)] px-1.5 py-0.5 text-[0.6875rem]"
                      >
                        {c.bracketsFormula}
                      </span>
                    ) : (
                      money(r.parcelaAbater ?? 0)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 border-t border-[var(--lfp-line)] px-5 py-4 text-sm leading-relaxed">
        {active && (
          <>
            <p>{tr(c.bracketsMarginalIs, { rate: pct(active.taxaMarginalMaxima, lang) })}</p>
            <p>{tr(c.bracketsEffectiveIs, { rate: pct(result.taxaEfetivaIrs, lang) })}</p>
          </>
        )}
        {proof && (
          <p className="lfp-tile mt-3 p-3">
            {tr(c.bracketsProof, { below: money0(proof.below), above: money0(proof.above) })}{" "}
            <span className="lfp-num lfp-keep font-semibold">
              {money(proof.netBelow.liquidoMensal)} → {money(proof.netAbove.liquidoMensal)}
            </span>
          </p>
        )}
      </div>

      {annual.length > 0 && (
        <details className="border-t border-[var(--lfp-line)]">
          <summary className="lfp-focus flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            {c.annualTitle}
            <span aria-hidden="true" className="text-[var(--lfp-mist)]">
              +
            </span>
          </summary>
          <table className="w-full border-t border-[var(--lfp-line)] text-sm">
            <tbody>
              {annual.map((e, i) => (
                <tr key={i} className="border-b border-[var(--lfp-line)] last:border-0">
                  <th scope="row" className="lfp-num px-5 py-2 text-left font-normal">
                    {e.to === null
                      ? `${c.bracketsAbove} ${money0(e.from)}`
                      : `${c.annualFrom} ${money0(e.from)} ${c.annualTo} ${money0(e.to)}`}
                  </th>
                  <td className="lfp-num px-5 py-2 text-right">{pct(e.rate, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
