"use client";

/* Who pays what to Social Security on a given gross: the 11% you see and
   the 23.75% you don't. Both rates come from the dataset. */

import { useState } from "react";
import { WedgeBar } from "../flow/WedgeBar";
import { eur, pct } from "../format";
import { tr } from "../i18n";
import type { FlowStream, TsuDataset } from "../types";
import { YearChip } from "../ui/DataHonesty";
import { NumberField } from "../ui/Inputs";
import { useLfpLang } from "../useLfpLang";

export function TsuSplit({ tsu }: { tsu: TsuDataset }) {
  const { t, lang } = useLfpLang();
  const c = t.explainers.common;
  const [bruto, setBruto] = useState(1500);

  const regime = tsu.regimes.find((r) => r.id === tsu.defaultRegime) ?? tsu.regimes[0];
  const worker = Math.round(bruto * regime.trabalhador * 100) / 100;
  const employer = Math.round(bruto * regime.entidadePatronal * 100) / 100;
  const total = Math.round((worker + employer) * 100) / 100;
  const money = (n: number) => eur(n, lang);

  const streams: FlowStream[] = [
    {
      id: "trab",
      label: `${c.tsuSplitWorker} · ${pct(regime.trabalhador, lang, 2)}`,
      amount: worker,
      direction: "toState",
      tone: "tsu-trab",
    },
    {
      id: "patronal",
      label: `${c.tsuSplitEmployer} · ${pct(regime.entidadePatronal, lang, 2)}`,
      amount: employer,
      direction: "toState",
      tone: "tsu-patronal",
    },
  ];

  return (
    <div className="lfp-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h3 className="text-sm font-semibold">
          {tr(c.tsuSplitTitle, { amount: money(bruto) })}
          <YearChip year={tsu.meta.year} />
        </h3>
        <div className="w-full max-w-[14rem]">
          <NumberField label={c.bracketsSalary} value={bruto} onChange={setBruto} min={0} max={100000} />
        </div>
      </div>
      <div className="mt-4">
        <WedgeBar streams={streams} baseline={total} formatAmount={money} />
      </div>
      <p className="lfp-num mt-3 text-sm">
        <span className="text-[var(--lfp-mist)]">{c.tsuSplitTotal}:</span>{" "}
        <span className="lfp-state font-semibold">{money(total)}</span>{" "}
        <span className="text-[var(--lfp-mist)]">
          ({pct(regime.trabalhador + regime.entidadePatronal, lang, 2)} {c.tsuSplitOn} {money(bruto)})
        </span>
      </p>
    </div>
  );
}
