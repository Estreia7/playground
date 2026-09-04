"use client";

import Link from "next/link";
import { Shell, PageIntro } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import type { Dict } from "../i18n";

type TopicKey = keyof Dict["chrome"]["individual"]["topics"];

/** Routing and readiness live in code; the copy lives in the dictionary. */
const TOPICS: Array<{ key: TopicKey; href: string; kind: "explicacao" | "calculadora"; ready: boolean }> = [
  { key: "salarioLiquido", href: "/lfp/individual/salario-liquido", kind: "calculadora", ready: true },
  { key: "irs", href: "/lfp/individual/irs", kind: "explicacao", ready: false },
  { key: "tsu", href: "/lfp/individual/tsu", kind: "explicacao", ready: false },
  { key: "recibosVerdes", href: "/lfp/individual/recibos-verdes", kind: "calculadora", ready: false },
  { key: "cenarios", href: "/lfp/individual/cenarios", kind: "calculadora", ready: false },
];

export default function IndividualHub() {
  const { t } = useLfpLang();
  const i = t.chrome.individual;
  const kindLabel = (k: "explicacao" | "calculadora") =>
    k === "explicacao" ? i.kindExplicacao : i.kindCalculadora;

  return (
    <Shell crumbs={[{ label: i.crumb }]}>
      <PageIntro eyebrow={i.eyebrow} title={i.title} lede={i.lede} />

      <section className="grid gap-4 sm:grid-cols-2" aria-label={i.topicsAria}>
        {TOPICS.map((topic) => {
          const copy = i.topics[topic.key];
          return topic.ready ? (
            <Link
              key={topic.key}
              href={topic.href}
              className="lfp-tile lfp-focus lfp-press p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              <p className="lfp-eyebrow">{kindLabel(topic.kind)}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{copy.body}</p>
            </Link>
          ) : (
            <div key={topic.key} className="lfp-tile p-6 opacity-70" aria-disabled="true">
              <p className="lfp-eyebrow">
                {kindLabel(topic.kind)} · <span className="text-[var(--lfp-ouro)]">{i.soon}</span>
              </p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{copy.body}</p>
            </div>
          );
        })}
      </section>
    </Shell>
  );
}
