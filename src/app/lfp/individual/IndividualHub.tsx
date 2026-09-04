"use client";

import Link from "next/link";
import { Shell, PageIntro } from "../ui/Shell";

interface Topic {
  href: string;
  kind: "Explicação" | "Calculadora";
  title: string;
  body: string;
  ready: boolean;
}

const TOPICS: Topic[] = [
  {
    href: "/lfp/individual/salario-liquido",
    kind: "Calculadora",
    title: "Salário líquido",
    body: "Do bruto ao que entra na conta: IRS, Segurança Social, subsídio de refeição, dependentes.",
    ready: true,
  },
  {
    href: "/lfp/individual/irs",
    kind: "Explicação",
    title: "IRS",
    body: "O que é, porque é progressivo, e porque subir de escalão nunca te faz ganhar menos.",
    ready: false,
  },
  {
    href: "/lfp/individual/tsu",
    kind: "Explicação",
    title: "Segurança Social",
    body: "Os 11% que descontas todos os meses: para onde vão e o que te dão em troca.",
    ready: false,
  },
  {
    href: "/lfp/individual/recibos-verdes",
    kind: "Calculadora",
    title: "Recibos verdes ou contrato?",
    body: "O mesmo valor bruto pelas duas vias — o que sobra e o que perdes em proteção.",
    ready: false,
  },
  {
    href: "/lfp/individual/cenarios",
    kind: "Calculadora",
    title: "Comparar cenários",
    body: "Emprego atual contra proposta nova, lado a lado, com o mesmo cálculo.",
    ready: false,
  },
];

export default function IndividualHub() {
  return (
    <Shell crumbs={[{ label: "Individual" }]}>
      <PageIntro
        eyebrow="Para ti"
        title="O que sai do teu salário, e para onde vai."
        lede="Cada mês, antes de veres o dinheiro, saem duas fatias: uma para o IRS, outra para a Segurança Social. Aqui explicamos as duas e deixamos-te fazer as contas ao teu caso."
      />

      <section className="grid gap-4 sm:grid-cols-2" aria-label="Temas">
        {TOPICS.map((t) =>
          t.ready ? (
            <Link
              key={t.href}
              href={t.href}
              className="lfp-tile lfp-focus lfp-press p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              <p className="lfp-eyebrow">{t.kind}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{t.body}</p>
            </Link>
          ) : (
            <div key={t.href} className="lfp-tile p-6 opacity-70" aria-disabled="true">
              <p className="lfp-eyebrow">
                {t.kind} · <span className="text-[var(--lfp-ouro)]">Em breve</span>
              </p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{t.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{t.body}</p>
            </div>
          )
        )}
      </section>
    </Shell>
  );
}
