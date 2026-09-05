"use client";

/* Long-form reading scaffold. Read mode: structure for comprehension first,
   then make the page worth staying in. A measure of ~65–75 characters for
   prose, the interactive widgets allowed to sit wider, native disclosures for
   the FAQ so keyboard and screen-reader behaviour comes for free. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Block, Explainer, Widget } from "../i18n/explainers.pt";
import type { DatasetMeta } from "../types";
import { SourceBadge } from "../ui/DataHonesty";
import { PageIntro, Shell, type Crumb } from "../ui/Shell";
import { useLfpLang } from "../useLfpLang";

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => {
        switch (b.t) {
          case "p":
            return (
              <p key={i} className="text-[1.0625rem] leading-relaxed">
                {b.text}
              </p>
            );
          case "callout":
            return (
              <aside key={i} className="lfp-tile p-4 sm:p-5">
                {b.title && <p className="lfp-eyebrow mb-1.5">{b.title}</p>}
                <p className="text-[0.9375rem] leading-relaxed">{b.text}</p>
              </aside>
            );
          case "list":
            return (
              <ul key={i} className="space-y-2">
                {b.items.map((it) => (
                  <li key={it} className="flex gap-3 text-[1.0625rem] leading-relaxed">
                    <span
                      aria-hidden="true"
                      className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lfp-cobalt)]"
                    />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            );
          case "steps":
            // Numbered because the content IS a sequence — the order is the
            // information. Never used for lists that merely have several items.
            return (
              <ol key={i} className="space-y-3">
                {b.items.map((st, n) => (
                  <li key={st.title} className="flex gap-4">
                    <span
                      aria-hidden="true"
                      className="lfp-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--lfp-cobalt)] text-sm font-semibold text-[var(--lfp-cobalt)]"
                    >
                      {n + 1}
                    </span>
                    <div className="pt-1">
                      <p className="font-semibold">{st.title}</p>
                      <p className="mt-1 text-[0.9375rem] leading-relaxed text-[var(--lfp-mist)]">
                        {st.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            );
        }
      })}
    </div>
  );
}

/** A single explainer block with a heading — used by calculator pages that
 *  carry a short "how it works" beside the tool. */
export function ExplainerSection({
  id,
  heading,
  blocks,
}: {
  id?: string;
  heading: string;
  blocks: Block[];
}) {
  return (
    <section id={id} className="lfp-panel scroll-mt-24 p-5 sm:p-6">
      <h2 className="lfp-display mb-4 text-2xl font-semibold">{heading}</h2>
      <Blocks blocks={blocks} />
    </section>
  );
}

export function ExplainerPage({
  content,
  crumbs,
  sources,
  widgets = {},
}: {
  content: Explainer;
  crumbs: Crumb[];
  sources: DatasetMeta[];
  /** Interactive components the page slots into sections that declare a widget. */
  widgets?: Partial<Record<Widget, ReactNode>>;
}) {
  const { t } = useLfpLang();
  const common = t.explainers.common;

  return (
    <Shell crumbs={crumbs}>
      <PageIntro eyebrow={content.eyebrow} title={content.title} lede={content.lede} />

      <div className="max-w-3xl space-y-8">
        <section className="lfp-panel p-5 sm:p-6" aria-labelledby="lfp-tldr">
          <p id="lfp-tldr" className="lfp-eyebrow mb-3">
            {content.tldrTitle}
          </p>
          <ul className="space-y-2.5">
            {content.tldr.map((line) => (
              <li key={line} className="flex gap-3 leading-relaxed">
                <span
                  aria-hidden="true"
                  className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--lfp-verde)]"
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </section>

        {content.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2 className="lfp-display mb-4 text-2xl font-semibold sm:text-3xl">{s.heading}</h2>
            <Blocks blocks={s.blocks} />
            {s.widget && widgets[s.widget] && <div className="mt-6">{widgets[s.widget]}</div>}
          </section>
        ))}

        <section aria-labelledby="lfp-faq">
          <h2 id="lfp-faq" className="lfp-display mb-4 text-2xl font-semibold sm:text-3xl">
            {content.faqTitle}
          </h2>
          <div className="lfp-panel divide-y divide-[var(--lfp-line)]">
            {content.faq.map((f) => (
              <details key={f.q} className="group">
                <summary className="lfp-focus flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[var(--lfp-mist)] transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-5 pb-4 text-[0.9375rem] leading-relaxed text-[var(--lfp-mist)]">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {sources.length > 0 && (
          <section aria-labelledby="lfp-sources">
            <p id="lfp-sources" className="lfp-eyebrow mb-2">
              {common.sourcesTitle}
            </p>
            <div className="space-y-1.5">
              {sources.map((m) => (
                <SourceBadge key={m.source} meta={m} />
              ))}
            </div>
          </section>
        )}

        <Link
          href={content.next.href}
          className="lfp-tile lfp-focus lfp-press flex items-center justify-between gap-4 p-5 transition-colors hover:border-[var(--lfp-cobalt)]"
        >
          <div>
            <p className="lfp-eyebrow">{content.next.label}</p>
            <p className="lfp-display mt-1 text-xl font-semibold">{content.next.title}</p>
          </div>
          <span aria-hidden="true" className="text-2xl text-[var(--lfp-cobalt)]">
            →
          </span>
        </Link>
      </div>
    </Shell>
  );
}
