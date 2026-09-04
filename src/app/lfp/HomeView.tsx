"use client";

import Link from "next/link";
import { useState } from "react";
import { MoneyFlow } from "./flow/MoneyFlow";
import { eur0 } from "./format";
import type { FlowStream } from "./types";

/* Illustrative figures for the hero. Deliberately round and labelled as an
   example — the real numbers come from the calculators, which cite sources. */
const DEMO_BRUTO = 1500;
const DEMO_STREAMS: FlowStream[] = [
  { id: "liquido", label: "Fica contigo", amount: 1152, direction: "toPeople", tone: "liquido" },
  { id: "irs", label: "IRS", amount: 183, direction: "toState", tone: "irs" },
  { id: "tsu", label: "Segurança Social", amount: 165, direction: "toState", tone: "tsu-trab" },
];

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
  const [active, setActive] = useState<string | null>(null);
  const toState = DEMO_STREAMS.filter((s) => s.direction === "toState");
  const stateTotal = toState.reduce((s, x) => s + x.amount, 0);

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

        {/* The signature: money leaving the wallet, split into real streams. */}
        <section className="mt-8" aria-labelledby="lfp-fluxo">
          <div className="lfp-panel overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--lfp-line)] px-5 py-3">
              <h2 id="lfp-fluxo" className="text-sm font-semibold">
                Para onde vai um salário de {eur0(DEMO_BRUTO)}
              </h2>
              <span className="lfp-eyebrow">Exemplo ilustrativo</span>
            </div>

            <div className="px-2 py-3 sm:px-5 sm:py-5">
              <MoneyFlow
                origin={{ label: "A tua carteira", total: 1152 }}
                destination={{ label: "O Estado", total: stateTotal }}
                streams={DEMO_STREAMS}
                baseline={DEMO_BRUTO}
                activeStreamId={active}
                onStreamHover={setActive}
                formatAmount={(n) => eur0(n)}
                ariaLabel={`De ${eur0(DEMO_BRUTO)} de salário bruto: ${eur0(1152)} ficam na carteira, ${eur0(183)} vão para o IRS e ${eur0(165)} para a Segurança Social.`}
              />
            </div>

            {/* The same figures as text. Screen-reader and sighted users read
                identical data, and this survives with motion disabled. Kept
                quiet so it reads as the ledger under the diagram, not a rival. */}
            <table className="w-full border-t border-[var(--lfp-line)] text-sm">
              <caption className="sr-only">
                Repartição de um salário bruto de {eur0(DEMO_BRUTO)}
              </caption>
              <thead>
                <tr className="border-b border-[var(--lfp-line)]">
                  <th scope="col" className="lfp-eyebrow px-5 py-2 text-left font-normal">
                    Destino
                  </th>
                  <th scope="col" className="lfp-eyebrow px-5 py-2 text-right font-normal">
                    Valor
                  </th>
                  <th scope="col" className="lfp-eyebrow w-20 px-5 py-2 text-right font-normal">
                    Peso
                  </th>
                </tr>
              </thead>
              <tbody>
                {DEMO_STREAMS.map((s) => (
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
                      {Math.round((s.amount / DEMO_BRUTO) * 100)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                Perguntas rápidas de escolha múltipla, com explicação e fonte em cada resposta.
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
          {/* inline-block + padding grows the hit area without breaking the
              sentence it sits inside. */}
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
