"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MoneyFlow } from "./flow/MoneyFlow";
import { fromSalarioLiquido } from "./flow/adapters";
import { salarioLiquido } from "./calc";
import { eur0, pct } from "./format";
import { useLfpData } from "./useLfpData";
import { UnverifiedBanner, YearChip } from "./ui/DataHonesty";
import type { SalarioLiquidoInput } from "./types";

/** Preset salaries: minimum wage, roughly the national median, and two above.
 *  Concrete anchors beat an empty input box on a landing page. */
const PRESETS = [920, 1200, 1500, 2500];

const NO_SUB = {
  ativo: false,
  valorDiario: 0,
  meio: "cartao" as const,
  diasMes: 22,
};

interface Door {
  href: string;
  eyebrow: string;
  title: string;
  body: string;
  items: string[];
}

const DOORS: Door[] = [
  {
    href: "/lfp/individual",
    eyebrow: "Para ti",
    title: "Individual",
    body: "O que sai do teu salário, para onde vai, e o que sobra ao fim do mês.",
    items: ["IRS explicado", "Salário líquido", "Segurança Social", "Recibos verdes"],
  },
  {
    href: "/lfp/empresarial",
    eyebrow: "Para empresas",
    title: "Empresarial",
    body: "Quanto custa mesmo um trabalhador, e como funcionam o IVA e o IRC.",
    items: ["Custo real de um salário", "IVA", "IRC", "Derramas"],
  },
  {
    href: "/lfp/economia",
    eyebrow: "Contexto",
    title: "Economia",
    body: "Inflação, poder de compra, e como Portugal se compara lá fora.",
    items: ["Máquina do tempo", "Onde te situas", "Dias de trabalho", "Onde vão os impostos"],
  },
];

export default function HomeView() {
  const { data, meta, loading, error } = useLfpData();
  const [bruto, setBruto] = useState(1500);
  const [active, setActive] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!data?.irs || !data?.tsu) return null;
    const input: SalarioLiquidoInput = {
      brutoMensal: bruto,
      meses: 14,
      situacao: "nao_casado",
      dependentes: 0,
      regiao: "continente",
      subsidioRefeicao: NO_SUB,
    };
    return salarioLiquido(input, { irs: data.irs, tsu: data.tsu });
  }, [data, bruto]);

  const flow = useMemo(
    () =>
      result
        ? fromSalarioLiquido(result, {
            carteira: "A tua carteira",
            estado: "O Estado",
            liquido: "Fica contigo",
            irs: "IRS",
            tsu: "Segurança Social",
          })
        : null,
    [result]
  );

  const year = data?.irs?.meta.year;

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--lfp-line)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="lfp-focus -my-2 inline-flex min-h-11 items-center py-2 text-sm text-[var(--lfp-mist)] transition-colors hover:text-[var(--lfp-cobalt)]"
          >
            ← Playground
          </Link>
          <span className="lfp-eyebrow">Informação pública · sem valor legal</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="pt-14 pb-4 sm:pt-20">
          <p className="lfp-eyebrow mb-4">Literacia Financeira Portuguesa</p>
          <h1 className="lfp-display max-w-3xl text-[2.5rem] font-semibold sm:text-6xl">
            O teu dinheiro, explicado sem dores de cabeça.
          </h1>
          <p className="mt-5 max-w-xl text-[1.0625rem] leading-relaxed text-[var(--lfp-mist)]">
            IRS, IVA, IRC, Segurança Social e inflação — em português simples, com
            calculadoras e números que podes verificar.
          </p>
        </section>

        {meta && (
          <div className="mt-6">
            <UnverifiedBanner datasets={meta.datasets} missing={meta.missing} />
          </div>
        )}

        {/* The signature: real money, from the real tables. */}
        <section className="mt-8" aria-labelledby="lfp-fluxo">
          <div className="lfp-panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--lfp-line)] px-5 py-3">
              <h2 id="lfp-fluxo" className="text-sm font-semibold">
                Para onde vai um salário de {eur0(bruto)}
                {year && <YearChip year={year} />}
              </h2>

              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Escolher salário bruto mensal"
              >
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setBruto(p)}
                    aria-pressed={bruto === p}
                    className={`lfp-num lfp-focus lfp-press min-h-11 rounded-lg border px-3 text-sm transition-colors ${
                      bruto === p
                        ? "border-[var(--lfp-cobalt)] bg-[var(--lfp-cobalt)] text-[var(--lfp-cal-tile)]"
                        : "border-[var(--lfp-line)] text-[var(--lfp-mist)] hover:border-[var(--lfp-cobalt)]"
                    }`}
                  >
                    {eur0(p)}
                  </button>
                ))}
              </div>
            </div>

            {loading && (
              <p className="px-5 py-16 text-center text-sm text-[var(--lfp-mist)]">
                A carregar os dados fiscais…
              </p>
            )}

            {error && (
              <p className="px-5 py-16 text-center text-sm text-[var(--lfp-vermelho)]">
                Não foi possível carregar os dados fiscais. Tenta recarregar a página.
              </p>
            )}

            {result && flow && (
              <>
                <div className="px-2 py-3 sm:px-5 sm:py-5">
                  <MoneyFlow
                    origin={flow.origin}
                    destination={flow.destination}
                    streams={flow.streams}
                    baseline={flow.baseline}
                    activeStreamId={active}
                    onStreamHover={setActive}
                    formatAmount={(n) => eur0(n)}
                    ariaLabel={`De ${eur0(bruto)} de salário bruto: ${eur0(result.liquidoMensal)} ficam na carteira, ${eur0(result.irsRetido)} vão para o IRS e ${eur0(result.tsuTrabalhador)} para a Segurança Social.`}
                  />
                </div>

                {/* The same figures as text — identical data for screen-reader
                    and sighted users, and it survives with motion disabled. */}
                <table className="w-full border-t border-[var(--lfp-line)] text-sm">
                  <caption className="sr-only">
                    Repartição de um salário bruto de {eur0(bruto)}
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--lfp-line)]">
                      <th scope="col" className="lfp-eyebrow px-5 py-2 text-left font-normal">
                        Destino
                      </th>
                      <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">
                        Valor
                      </th>
                      <th
                        scope="col"
                        className="lfp-eyebrow w-20 px-5 py-2 text-right font-normal"
                      >
                        Peso
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {flow.streams.map((s) => (
                      <tr
                        key={s.id}
                        onPointerEnter={() => setActive(s.id)}
                        onPointerLeave={() => setActive(null)}
                        className="border-b border-[var(--lfp-line)] transition-colors last:border-0 hover:bg-[var(--lfp-cobalt-faint)]"
                      >
                        <th scope="row" className="px-5 py-2.5 text-left font-medium">
                          <span
                            aria-hidden="true"
                            className="mr-2.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                            style={{ background: `var(--lfp-tone-${s.tone})` }}
                          />
                          {s.label}
                        </th>
                        <td className="lfp-num px-5 py-2.5 text-right font-semibold">
                          {eur0(s.amount)}
                        </td>
                        <td className="lfp-num w-20 px-5 py-2.5 text-right text-[var(--lfp-mist)]">
                          {pct(s.amount / flow.baseline, "pt", 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="border-t border-[var(--lfp-line)] px-5 py-3 text-xs leading-relaxed text-[var(--lfp-mist)]">
                  Solteiro, sem dependentes, Continente, sem subsídio de refeição. A
                  retenção é um adiantamento mensal — o acerto faz-se na declaração
                  anual.{" "}
                  <Link
                    href="/lfp/individual/salario-liquido"
                    className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
                  >
                    Calcular o teu caso
                  </Link>
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DOORS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="lfp-tile lfp-focus lfp-press group p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              <p className="lfp-eyebrow">{d.eyebrow}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{d.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{d.body}</p>
              <ul className="mt-4 space-y-1.5">
                {d.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-sm">
                    <span
                      aria-hidden="true"
                      className="h-1 w-1 rounded-full bg-[var(--lfp-cobalt)]"
                    />
                    {it}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </section>

        <section className="mt-4 mb-16">
          <Link
            href="/lfp/quiz"
            className="lfp-tile lfp-focus lfp-press flex flex-wrap items-center justify-between gap-4 p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
          >
            <div>
              <p className="lfp-eyebrow">Testa-te</p>
              <h2 className="lfp-display mt-1 text-2xl font-semibold">
                Quão boa é a tua literacia financeira?
              </h2>
              <p className="mt-1.5 text-sm text-[var(--lfp-mist)]">
                Perguntas rápidas de escolha múltipla, com explicação e fonte em cada
                resposta.
              </p>
            </div>
            <span className="lfp-num rounded-full border border-[var(--lfp-cobalt)] px-4 py-2 text-sm font-semibold text-[var(--lfp-cobalt)]">
              Começar →
            </span>
          </Link>
        </section>
      </main>

      <footer className="border-t border-[var(--lfp-line)]">
        <div className="mx-auto max-w-6xl px-6 py-5 text-xs leading-relaxed text-[var(--lfp-mist)]">
          Projeto educativo, construído a partir de informação pública.{" "}
          <strong className="font-semibold">Não tem valor legal</strong> e não substitui
          aconselhamento fiscal. Cada número indica o ano e a fonte.{" "}
          <Link
            href="/lfp/sobre"
            className="lfp-focus inline-flex min-h-11 items-center font-medium text-[var(--lfp-cobalt)] underline underline-offset-2"
          >
            Fontes e metodologia
          </Link>
        </div>
      </footer>
    </div>
  );
}
