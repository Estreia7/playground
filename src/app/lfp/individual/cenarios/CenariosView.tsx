"use client";

import { useMemo, useState } from "react";
import { round2, salarioLiquido } from "../../calc";
import { eur, eur0 } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField, Stepper } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";
import type { SituacaoIrs } from "../../types";

interface Scenario {
  bruto: number;
  meses: 12 | 14;
  sub: number;
}

/** Meal allowance is paid on working days only — not in holidays, not with
 *  the two bonus payments — so a year of it is eleven months. */
const SUB_MONTHS = 11;

/* Module-level on purpose: defined inside the view it would be a new
   component type every render, remounting the inputs under the cursor. */
function ScenarioForm({
  label,
  value,
  onChange,
  fields,
}: {
  label: string;
  value: Scenario;
  onChange: (s: Scenario) => void;
  fields: { bruto: string; meses: string; meses14: string; meses12: string; sub: string; subHint: string };
}) {
  return (
    <fieldset className="min-w-0 space-y-4">
      <legend className="lfp-eyebrow mb-1">{label}</legend>
      <NumberField label={fields.bruto} value={value.bruto} onChange={(n) => onChange({ ...value, bruto: n })} min={0} max={100000} />
      <ChoiceGroup
        label={fields.meses}
        value={value.meses}
        onChange={(m) => onChange({ ...value, meses: m })}
        choices={[
          { value: 14 as const, label: fields.meses14 },
          { value: 12 as const, label: fields.meses12 },
        ]}
      />
      <NumberField label={fields.sub} value={value.sub} onChange={(n) => onChange({ ...value, sub: n })} min={0} max={50} step={0.5} hint={fields.subHint} />
    </fieldset>
  );
}

export default function CenariosView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.sec.cenarios;

  const [a, setA] = useState<Scenario>({ bruto: 1400, meses: 14, sub: 0 });
  const [b, setB] = useState<Scenario>({ bruto: 1600, meses: 12, sub: 6 });
  const [situacao, setSituacao] = useState<SituacaoIrs>("nao_casado");
  const [dependentes, setDependentes] = useState(0);

  const compute = (s: Scenario) => {
    if (!data?.irs || !data?.tsu) return null;
    const r = salarioLiquido(
      {
        brutoMensal: s.bruto,
        meses: s.meses,
        situacao,
        dependentes,
        regiao: "continente",
        subsidioRefeicao: { ativo: s.sub > 0, valorDiario: s.sub, meio: "cartao", diasMes: 22 },
      },
      { irs: data.irs, tsu: data.tsu }
    );
    const subMensal = round2(r.subsidioRefeicaoIsento + r.subsidioRefeicaoTributado);
    const subAnual = round2(subMensal * SUB_MONTHS);
    const liquidoAnual = round2((r.liquidoMensal - subMensal) * s.meses + subAnual);
    return {
      r,
      subAnual,
      liquidoAnual,
      liquido12: round2(liquidoAnual / 12),
      estadoAnual: round2(r.totalEntregueAoEstado * s.meses),
    };
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ra = useMemo(() => compute(a), [data, a, situacao, dependentes]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rb = useMemo(() => compute(b), [data, b, situacao, dependentes]);

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const diff = ra && rb ? round2(rb.liquidoAnual - ra.liquidoAnual) : 0;
  const winner = diff > 0 ? c.b : diff < 0 ? c.a : null;

  const cell = "lfp-num px-4 py-2.5 text-right";

  return (
    <Shell crumbs={[{ href: "/lfp/individual", label: t.chrome.individual.crumb }, { label: c.crumb }]}>
      <PageIntro eyebrow={c.eyebrow} title={c.title} lede={c.lede} />

      {meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
        </div>
      )}
      {loading && <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">{t.chrome.loading}</p>}
      {error && <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">{t.chrome.loadError}</p>}

      {ra && rb && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-6 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <ScenarioForm label={c.a} value={a} onChange={setA} fields={c.fields} />
            <div className="border-t border-[var(--lfp-line)]" />
            <ScenarioForm label={c.b} value={b} onChange={setB} fields={c.fields} />
            <div className="border-t border-[var(--lfp-line)]" />
            <fieldset className="min-w-0 space-y-4">
              <legend className="lfp-eyebrow mb-1">{c.shared}</legend>
              <ChoiceGroup
                label={c.fields.situacao}
                value={situacao}
                onChange={setSituacao}
                choices={[
                  { value: "nao_casado" as const, label: c.fields.naoCasado },
                  { value: "casado_dois_titulares" as const, label: c.fields.casado2 },
                ]}
              />
              <Stepper label={c.fields.dependentes} value={dependentes} onChange={setDependentes} min={0} max={8} />
            </fieldset>
          </form>

          <div className="min-w-0 space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {winner ? tr(c.headline.eyebrow, { winner }) : c.headline.same}
                {data?.irs && <YearChip year={data.irs.meta.year} />}
              </p>
              <p className="lfp-display mt-2 text-5xl font-semibold sm:text-6xl">
                <span className={`lfp-num ${diff !== 0 ? "lfp-keep" : ""}`}>{money0(Math.abs(diff))}</span>
              </p>
              <p className="mt-2 text-sm text-[var(--lfp-mist)]">
                {c.headline.diff}
                {diff !== 0 && <> · {tr(c.headline.perMonth, { amount: money(Math.abs(diff) / 12) })}</>}
              </p>
            </div>

            <div className="lfp-panel overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="border-b border-[var(--lfp-line)] px-4 py-3 text-left text-sm font-semibold">{c.table.caption}</caption>
                <thead>
                  <tr className="border-b border-[var(--lfp-line)]">
                    <td />
                    <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.a}</th>
                    <th scope="col" className="lfp-eyebrow px-4 py-2 text-right font-normal">{c.b}</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      [c.table.brutoAnual, ra.r.brutoAnual, rb.r.brutoAnual, ""],
                      [c.table.liquidoMensal, ra.r.liquidoMensal, rb.r.liquidoMensal, ""],
                      [c.table.subAnual, ra.subAnual, rb.subAnual, ""],
                      [c.table.estado, ra.estadoAnual, rb.estadoAnual, "lfp-state"],
                      [c.table.liquidoAnual, ra.liquidoAnual, rb.liquidoAnual, "font-semibold lfp-keep"],
                      [c.table.liquido12, ra.liquido12, rb.liquido12, "font-semibold"],
                    ] as Array<[string, number, number, string]>
                  ).map(([label, va, vb, cls]) => (
                    <tr key={label} className="border-b border-[var(--lfp-line)] last:border-0">
                      <th scope="row" className={`px-4 py-2.5 text-left ${cls.includes("font-semibold") ? "font-semibold" : "font-normal text-[var(--lfp-mist)]"}`}>{label}</th>
                      <td className={`${cell} ${cls}`}>{money(va)}</td>
                      <td className={`${cell} ${cls}`}>{money(vb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside className="lfp-tile p-5">
              <p className="lfp-eyebrow">{c.insight.title}</p>
              <p className="mt-2 text-sm leading-relaxed">{c.insight.text}</p>
            </aside>

            <Disclaimer notes={c.notes} />
            {data?.irs && <SourceBadge meta={data.irs.meta} />}
            {data?.tsu && <SourceBadge meta={data.tsu.meta} />}
          </div>
        </div>
      )}
    </Shell>
  );
}
