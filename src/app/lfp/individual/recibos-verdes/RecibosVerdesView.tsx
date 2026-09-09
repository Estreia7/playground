"use client";

import { useMemo, useState } from "react";
import { custoEmpresa, recibosVerdes, round2, salarioLiquido } from "../../calc";
import { eur, eur0, pct } from "../../format";
import { tr } from "../../i18n";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField, Toggle } from "../../ui/Inputs";
import { Ledger, LedgerRow } from "../../ui/Ledger";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";

const NO_SUB = { ativo: false, valorDiario: 0, meio: "cartao" as const, diasMes: 22 };

export default function RecibosVerdesView() {
  const { data, meta, loading, error } = useLfpData();
  const { t, lang } = useLfpLang();
  const c = t.sec.recibosVerdes;

  const [bruto, setBruto] = useState(1500);
  const [basis, setBasis] = useState<"bruto" | "custo">("bruto");
  const [atividade, setAtividade] = useState<"servicos" | "vendas">("servicos");
  const [retencao, setRetencao] = useState(true);
  const [primeiroAno, setPrimeiroAno] = useState(false);

  const ind = data?.independentes;

  const result = useMemo(() => {
    const irs = data?.irs;
    const tsu = data?.tsu;
    if (!irs || !tsu || !ind) return null;
    const trabalhador = { situacao: "nao_casado" as const, dependentes: 0, regiao: "continente" as const };
    const contrato = salarioLiquido({ brutoMensal: bruto, meses: 14, ...trabalhador, subsidioRefeicao: NO_SUB }, { irs, tsu });
    const custo = custoEmpresa({ brutoMensal: bruto, meses: 14, subsidioRefeicao: NO_SUB, trabalhador }, { irs, tsu });
    const faturacaoAnual = basis === "bruto" ? contrato.brutoAnual : custo.custoTotalAnual;
    const faturacaoMensal = round2(faturacaoAnual / 12);
    const rv = recibosVerdes({ faturacaoMensal, atividade, retencaoNaFonte: retencao, primeiroAno }, { independentes: ind });
    return { contrato, custo, rv, faturacaoMensal, diff: round2(rv.liquidoAnual - contrato.liquidoAnual) };
  }, [data, ind, bruto, basis, atividade, retencao, primeiroAno]);

  const money = (n: number) => eur(n, lang);
  const money0 = (n: number) => eur0(n, lang);
  const avisoVars = ind
    ? { min: money(ind.contribuicaoMinima), n: ind.isencaoPrimeirosMeses, limit: money0(ind.retencao.dispensaAte) }
    : { min: "", n: 0, limit: "" };

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

      {result && ind && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start">
          <form onSubmit={(e) => e.preventDefault()} className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6" aria-label={c.formAria}>
            <NumberField label={c.fields.bruto} value={bruto} onChange={setBruto} min={0} max={100000} />
            <div>
              <ChoiceGroup
                label={c.fields.basis}
                value={basis}
                onChange={setBasis}
                columns={1}
                choices={[
                  { value: "bruto" as const, label: c.fields.basisBruto },
                  { value: "custo" as const, label: c.fields.basisCusto },
                ]}
              />
              <p className="mt-1 text-xs text-[var(--lfp-mist)]">{c.fields.basisHint}</p>
            </div>
            <ChoiceGroup
              label={c.fields.atividade}
              value={atividade}
              onChange={setAtividade}
              choices={[
                { value: "servicos" as const, label: c.fields.servicos },
                { value: "vendas" as const, label: c.fields.vendas },
              ]}
            />
            <Toggle label={c.fields.retencao} checked={retencao} onChange={setRetencao} hint={tr(c.fields.retencaoHint, { limit: avisoVars.limit })} />
            <Toggle label={c.fields.primeiroAno} checked={primeiroAno} onChange={setPrimeiroAno} hint={tr(c.fields.primeiroAnoHint, { n: ind.isencaoPrimeirosMeses })} />
          </form>

          <div className="space-y-6">
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                {c.headline.eyebrow}
                <YearChip year={ind.meta.year} />
              </p>
              <dl className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-[var(--lfp-mist)]">{c.headline.contrato}</dt>
                  <dd className="lfp-display lfp-num mt-1 text-4xl font-semibold sm:text-5xl">{money0(result.contrato.liquidoAnual)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-[var(--lfp-mist)]">{c.headline.recibos}</dt>
                  <dd className="lfp-display lfp-num mt-1 text-4xl font-semibold sm:text-5xl">{money0(result.rv.liquidoAnual)}</dd>
                </div>
              </dl>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-[var(--lfp-line)] pt-4 text-sm">
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.diff}</dt>
                  <dd className={`lfp-num font-semibold ${result.diff >= 0 ? "lfp-keep" : "lfp-state"}`}>
                    {result.diff >= 0 ? "+" : ""}{money(result.diff)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">{c.headline.invoice}</dt>
                  <dd className="lfp-num font-semibold">{money(result.faturacaoMensal)}</dd>
                </div>
              </dl>
            </div>

            {result.rv.avisos.length > 0 && (
              <ul aria-label={t.calc.salario.avisosAria} className="space-y-1.5">
                {result.rv.avisos.map((k) => (
                  <li key={k} className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-2 text-xs leading-relaxed text-[var(--lfp-cobalt-deep)]">
                    {tr(c.avisos[k as keyof typeof c.avisos] ?? k, avisoVars)}
                  </li>
                ))}
              </ul>
            )}

            <div className="grid gap-6 md:grid-cols-2">
              <Ledger caption={c.contratoLedger.caption}>
                <LedgerRow label={c.contratoLedger.bruto} value={money(bruto)} />
                <LedgerRow label={c.contratoLedger.tsu} value={`− ${money(result.contrato.tsuTrabalhador)}`} tone="state" />
                <LedgerRow label={c.contratoLedger.irs} value={`− ${money(result.contrato.irsRetido)}`} tone="state" />
                <LedgerRow label={c.contratoLedger.liquido} value={money(result.contrato.liquidoMensal)} strong tone="keep" />
                <LedgerRow label={c.contratoLedger.anual} value={money(result.contrato.liquidoAnual)} strong />
                <LedgerRow label={c.contratoLedger.custo} value={money(result.custo.custoTotalAnual)} />
              </Ledger>
              <Ledger caption={c.ledger.caption}>
                <LedgerRow label={c.ledger.faturacao} value={money(result.faturacaoMensal)} />
                <LedgerRow
                  label={tr(c.ledger.relevante, { coef: pct(atividade === "vendas" ? ind.coeficientes.vendas : ind.coeficientes.servicos, lang, 0) })}
                  value={money(result.rv.rendimentoRelevante)}
                />
                <LedgerRow label={tr(c.ledger.ss, { rate: pct(ind.taxaContributiva, lang) })} value={`− ${money(result.rv.contribuicaoSS)}`} tone="state" />
                <LedgerRow label={tr(c.ledger.retencao, { rate: pct(ind.retencao.taxa, lang, 0) })} value={`− ${money(result.rv.retencaoIrs)}`} tone="state" />
                <LedgerRow label={c.ledger.liquido} value={money(result.rv.liquidoMensal)} strong tone="keep" />
                <LedgerRow label={c.ledger.anual} value={money(result.rv.liquidoAnual)} strong />
              </Ledger>
            </div>

            <aside className="lfp-tile p-5">
              <p className="lfp-eyebrow">{c.lost.title}</p>
              <ul className="mt-3 space-y-2">
                {c.lost.items.map((li) => (
                  <li key={li} className="flex gap-3 text-sm leading-relaxed">
                    <span aria-hidden="true" className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lfp-vermelho)]" />
                    {li}
                  </li>
                ))}
              </ul>
            </aside>

            <Disclaimer notes={c.notes} />
            <SourceBadge meta={ind.meta} />
            {data?.irs && <SourceBadge meta={data.irs.meta} />}
          </div>
        </div>
      )}
    </Shell>
  );
}
