"use client";

import Link from "next/link";
import { Shell, PageIntro } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";
import type { Dict } from "../i18n";

type TopicKey = keyof Dict["economia"]["hub"]["topics"];

/** Routing and readiness live in code; the copy lives in the dictionary.
 *  "situas" waits on the Quadros de Pessoal brackets, which are not yet
 *  transcribed — shown as coming soon rather than built on guessed data. */
const TOPICS: Array<{ key: TopicKey; href: string; ready: boolean }> = [
  { key: "inflacao", href: "/lfp/economia/inflacao", ready: true },
  { key: "juros", href: "/lfp/economia/juros-compostos", ready: true },
  { key: "impostos", href: "/lfp/economia/impostos", ready: true },
  { key: "dias", href: "/lfp/economia/dias-de-trabalho", ready: true },
  { key: "situas", href: "/lfp/economia/onde-te-situas", ready: false },
];

export default function EconomiaHub() {
  const { t } = useLfpLang();
  const h = t.economia.hub;

  return (
    <Shell crumbs={[{ label: h.crumb }]}>
      <PageIntro eyebrow={h.eyebrow} title={h.title} lede={h.lede} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={h.topicsAria}>
        {TOPICS.map((topic) => {
          const copy = h.topics[topic.key];
          return topic.ready ? (
            <Link
              key={topic.key}
              href={topic.href}
              className="lfp-tile lfp-focus lfp-press p-6 transition-colors hover:border-[var(--lfp-cobalt)]"
            >
              <p className="lfp-eyebrow">{h.kindCalculadora}</p>
              <h2 className="lfp-display mt-2 text-2xl font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--lfp-mist)]">{copy.body}</p>
            </Link>
          ) : (
            <div key={topic.key} className="lfp-tile p-6 opacity-70" aria-disabled="true">
              <p className="lfp-eyebrow">
                {h.kindCalculadora} · <span className="text-[var(--lfp-ouro)]">{h.soon}</span>
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
