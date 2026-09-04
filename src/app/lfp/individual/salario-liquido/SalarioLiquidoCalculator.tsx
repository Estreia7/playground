"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { salarioLiquido } from "../../calc";
import { fromSalarioLiquido } from "../../flow/adapters";
import { MoneyFlow } from "../../flow/MoneyFlow";
import { WedgeBar } from "../../flow/WedgeBar";
import { eur, eur0, pct } from "../../format";
import { Disclaimer, SourceBadge, UnverifiedBanner, YearChip } from "../../ui/DataHonesty";
import { ChoiceGroup, NumberField, Stepper, Toggle } from "../../ui/Inputs";
import { PageIntro, Shell } from "../../ui/Shell";
import { useLfpData } from "../../useLfpData";
import type { SalarioLiquidoInput, SituacaoIrs } from "../../types";

/** The avisos the calculator can raise, in the user's words. */
const AVISOS: Record<string, string> = {
  "aviso.subsidio_excede_isencao":
    "O subsídio de refeição ultrapassa o limite isento — o excesso paga IRS e Segurança Social.",
  "aviso.tabela_indisponivel":
    "Ainda não temos a tabela de retenção para esta situação. O IRS aparece a zero.",
};

const LABELS = {
  carteira: "A tua carteira",
  estado: "O Estado",
  liquido: "Fica contigo",
  irs: "IRS",
  tsu: "Segurança Social",
};

export default function SalarioLiquidoCalculator() {
  const { data, meta, loading, error } = useLfpData();

  const [bruto, setBruto] = useState(1500);
  const [meses, setMeses] = useState<12 | 14>(14);
  const [situacao, setSituacao] = useState<SituacaoIrs>("nao_casado");
  const [dependentes, setDependentes] = useState(0);
  const [subAtivo, setSubAtivo] = useState(false);
  const [subValor, setSubValor] = useState(6);
  const [subMeio, setSubMeio] = useState<"dinheiro" | "cartao">("cartao");
  const [subDias, setSubDias] = useState(22);
  const [active, setActive] = useState<string | null>(null);

  const input = useMemo<SalarioLiquidoInput>(
    () => ({
      brutoMensal: bruto,
      meses,
      situacao,
      dependentes,
      regiao: "continente",
      subsidioRefeicao: { ativo: subAtivo, valorDiario: subValor, meio: subMeio, diasMes: subDias },
    }),
    [bruto, meses, situacao, dependentes, subAtivo, subValor, subMeio, subDias]
  );

  const result = useMemo(
    () => (data?.irs && data?.tsu ? salarioLiquido(input, { irs: data.irs, tsu: data.tsu }) : null),
    [data, input]
  );

  const flow = useMemo(() => (result ? fromSalarioLiquido(result, LABELS) : null), [result]);

  const irsMeta = data?.irs?.meta;
  // Captured once so the narrowing survives into the .find() callback.
  const tsu = data?.tsu;
  const tsuRate = tsu
    ? (tsu.regimes.find((r) => r.id === tsu.defaultRegime) ?? tsu.regimes[0])?.trabalhador ??
      null
    : null;
  const tsuMeta = data?.tsu?.meta;
  const ceiling = data?.tsu
    ? subMeio === "cartao"
      ? data.tsu.subsidioRefeicao.cartao
      : data.tsu.subsidioRefeicao.dinheiro
    : null;

  return (
    <Shell crumbs={[{ href: "/lfp/individual", label: "Individual" }, { label: "Salário líquido" }]}>
      <PageIntro
        eyebrow="Calculadora"
        title="Quanto do teu salário fica mesmo contigo?"
        lede="Põe o bruto, ajusta a tua situação, e vê cada euro a seguir o seu caminho. A retenção de IRS é um adiantamento — o acerto final faz-se na declaração anual."
      />

      {meta && (
        <div className="mb-6">
          <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
        </div>
      )}

      {loading && (
        <p className="py-16 text-center text-sm text-[var(--lfp-mist)]">A carregar os dados fiscais…</p>
      )}
      {error && (
        <p className="py-16 text-center text-sm text-[var(--lfp-vermelho)]">
          Não foi possível carregar os dados fiscais. Tenta recarregar a página.
        </p>
      )}

      {result && flow && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] lg:items-start">
          {/* ── Inputs ─────────────────────────────────── */}
          <form
            onSubmit={(e) => e.preventDefault()}
            className="lfp-panel space-y-5 p-5 lg:sticky lg:top-6"
            aria-label="Dados do teu salário"
          >
            <NumberField
              label="Salário bruto mensal"
              value={bruto}
              onChange={setBruto}
              min={0}
              max={100000}
              hint="O valor antes de qualquer desconto."
            />

            <ChoiceGroup
              label="Pagamentos por ano"
              value={meses}
              onChange={setMeses}
              choices={[
                { value: 14, label: "14 meses" },
                { value: 12, label: "12 (duodécimos)" },
              ]}
            />

            <ChoiceGroup
              label="Situação"
              value={situacao}
              onChange={setSituacao}
              columns={1}
              choices={[
                { value: "nao_casado", label: "Não casado" },
                { value: "casado_dois_titulares", label: "Casado, dois titulares" },
              ]}
            />

            <Stepper
              label="Dependentes"
              value={dependentes}
              onChange={setDependentes}
              max={10}
              hint="Cada dependente reduz o IRS retido."
            />

            <div className="space-y-4 border-t border-[var(--lfp-line)] pt-5">
              <Toggle
                label="Recebo subsídio de refeição"
                checked={subAtivo}
                onChange={setSubAtivo}
              />
              {subAtivo && (
                <div className="space-y-4 pl-1">
                  <ChoiceGroup
                    label="Pago em"
                    value={subMeio}
                    onChange={setSubMeio}
                    choices={[
                      { value: "cartao", label: "Cartão" },
                      { value: "dinheiro", label: "Dinheiro" },
                    ]}
                  />
                  <NumberField
                    label="Valor por dia"
                    value={subValor}
                    onChange={setSubValor}
                    min={0}
                    max={100}
                    step={0.05}
                    hint={ceiling !== null ? `Isento até ${eur(ceiling)} por dia.` : undefined}
                  />
                  <Stepper
                    label="Dias por mês"
                    value={subDias}
                    onChange={setSubDias}
                    min={1}
                    max={23}
                  />
                </div>
              )}
            </div>
          </form>

          {/* ── Results ────────────────────────────────── */}
          <div className="space-y-6">
            {/* Headline */}
            <div className="lfp-panel px-5 py-5 sm:px-6">
              <p className="lfp-eyebrow">
                Entra na tua conta, por mês
                {irsMeta && <YearChip year={irsMeta.year} />}
              </p>
              <p className="lfp-display lfp-keep mt-2 text-5xl font-semibold sm:text-6xl">
                <span className="lfp-num">{eur(result.liquidoMensal)}</span>
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-[var(--lfp-mist)]">Por ano</dt>
                  <dd className="lfp-num font-semibold">{eur0(result.liquidoAnual)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">Vai para o Estado</dt>
                  <dd className="lfp-num lfp-state font-semibold">
                    {eur(result.totalEntregueAoEstado)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">Taxa efetiva de IRS</dt>
                  <dd className="lfp-num font-semibold">{pct(result.taxaEfetivaIrs)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--lfp-mist)]">Taxa marginal</dt>
                  <dd className="lfp-num font-semibold">
                    {result.escalaoAplicado ? pct(result.escalaoAplicado.taxaMarginalMaxima) : "—"}
                  </dd>
                </div>
              </dl>
            </div>

            {result.avisos.length > 0 && (
              <ul className="space-y-2" aria-label="Avisos">
                {result.avisos.map((a) => (
                  <li
                    key={a}
                    role="status"
                    className="rounded-lg border border-[var(--lfp-ouro)] bg-[var(--lfp-ouro-dim)] px-4 py-2.5 text-sm"
                  >
                    {AVISOS[a] ?? a}
                  </li>
                ))}
              </ul>
            )}

            {/* The flow */}
            <div className="lfp-panel overflow-hidden">
              <div className="border-b border-[var(--lfp-line)] px-5 py-3">
                <h2 className="text-sm font-semibold">Para onde vai cada euro</h2>
              </div>
              <div className="px-2 py-3 sm:px-5 sm:py-5">
                <MoneyFlow
                  origin={flow.origin}
                  destination={flow.destination}
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={(n) => eur0(n)}
                  ariaLabel={`De ${eur0(flow.baseline)}: ${eur0(result.liquidoMensal)} ficam na carteira, ${eur0(result.irsRetido)} vão para o IRS e ${eur0(result.tsuTrabalhador)} para a Segurança Social.`}
                />
              </div>
              <div className="border-t border-[var(--lfp-line)] px-5 py-4">
                <WedgeBar
                  streams={flow.streams}
                  baseline={flow.baseline}
                  activeStreamId={active}
                  onStreamHover={setActive}
                  formatAmount={(n) => eur(n)}
                />
              </div>
            </div>

            {/* The ledger — every figure, as text */}
            <div className="lfp-panel overflow-hidden">
              <table className="w-full text-sm">
                <caption className="border-b border-[var(--lfp-line)] px-5 py-3 text-left text-sm font-semibold">
                  A conta, linha a linha
                </caption>
                <tbody>
                  <Row label="Salário bruto" value={eur(result.brutoMensal)} strong />
                  {subAtivo && (
                    <>
                      <Row
                        label="Subsídio de refeição (isento)"
                        value={`+ ${eur(result.subsidioRefeicaoIsento)}`}
                        tone="keep"
                      />
                      {result.subsidioRefeicaoTributado > 0 && (
                        <Row
                          label="Subsídio de refeição (tributado)"
                          value={`+ ${eur(result.subsidioRefeicaoTributado)}`}
                        />
                      )}
                    </>
                  )}
                  <Row
                    label={
                      tsuRate !== null
                        ? `Segurança Social (${pct(tsuRate, "pt", 0)})`
                        : "Segurança Social"
                    }
                    value={`− ${eur(result.tsuTrabalhador)}`}
                    tone="state"
                  />
                  <Row
                    label={
                      result.escalaoAplicado
                        ? `IRS retido (escalão ${pct(result.escalaoAplicado.taxaMarginalMaxima)})`
                        : "IRS retido"
                    }
                    value={`− ${eur(result.irsRetido)}`}
                    tone="state"
                  />
                  <Row label="Líquido mensal" value={eur(result.liquidoMensal)} strong tone="keep" />
                  <Row
                    label={`Líquido anual (${meses} pagamentos)`}
                    value={eur0(result.liquidoAnual)}
                  />
                </tbody>
              </table>
            </div>

            <Disclaimer
              notes={[
                "Só Continente. Madeira e Açores têm tabelas próprias.",
                "Não considera IRS Jovem, deficiência, residente não habitual nem outros rendimentos.",
                "Os subsídios de férias e de Natal são retidos à parte, com a sua própria taxa — não empurram o mês para um escalão superior.",
              ]}
            />

            <div className="space-y-1.5">
              {irsMeta && <SourceBadge meta={irsMeta} />}
              {tsuMeta && <SourceBadge meta={tsuMeta} />}
            </div>

            <p className="text-sm text-[var(--lfp-mist)]">
              Queres perceber porque é que o IRS funciona assim?{" "}
              <Link
                href="/lfp/individual/irs"
                className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
              >
                Ler a explicação do IRS
              </Link>
            </p>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "keep" | "state";
}) {
  const color = tone === "keep" ? "lfp-keep" : tone === "state" ? "lfp-state" : "";
  return (
    <tr className="border-b border-[var(--lfp-line)] last:border-0">
      <th
        scope="row"
        className={`px-5 py-2.5 text-left ${strong ? "font-semibold" : "font-normal text-[var(--lfp-mist)]"}`}
      >
        {label}
      </th>
      <td className={`lfp-num whitespace-nowrap px-5 py-2.5 text-right ${strong ? "font-semibold" : ""} ${color}`}>
        {value}
      </td>
    </tr>
  );
}
