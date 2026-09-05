"use client";

import Link from "next/link";
import { Shell, PageIntro } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import type { Dict } from "../i18n";

type TopicKey = keyof Dict["empresarial"]["hub"]["topics"];

/** Routing lives in code; the copy lives in the dictionary. */
const TOPICS: Array<{ key: TopicKey; href: string }> = [
  { key: "custoTrabalhador", href: "/lfp/empresarial/custo-trabalhador" },
  { key: "iva", href: "/lfp/empresarial/iva" },
  { key: "irc", href: "/lfp/empresarial/irc" },
];

export default function EmpresarialHub() {
  const { t } = useLfpLang();
  const h = t.empresarial.hub;

  return (
    <Shell crumbs={[{ label: h.crumb }]}>
      <PageIntro eyebrow={h.eyebrow} title={h.title} lede={h.lede} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={h.topicsAria}>
        {TOPICS.map((topic) => {
          const copy = h.topics[topic.key];
          return (
            <Link
              key={topic.key}
              href={topic.href}
              className="lfp-tile lfp-focus lfp-press p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              <p className="lfp-eyebrow">{h.kindCalculadora}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{copy.body}</p>
            </Link>
          );
        })}
      </section>
    </Shell>
  );
}
