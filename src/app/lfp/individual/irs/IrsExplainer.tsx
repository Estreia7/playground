"use client";

import { useEffect, useState } from "react";
import { BracketTable } from "../../explainers/BracketTable";
import { ExplainerPage } from "../../explainers/ExplainerLayout";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";

export default function IrsExplainer() {
  const { data } = useLfpData();
  const { t } = useLfpLang();
  const content = t.explainers.irs;

  // The salary calculator links here with ?bruto=N so the table opens on the
  // reader's own bracket. Read after mount: no Suspense boundary, no static
  // bail-out, and the page is fully rendered with a default before it applies.
  const [fromUrl, setFromUrl] = useState<number | undefined>(undefined);
  useEffect(() => {
    const raw = new URLSearchParams(window.location.search).get("bruto");
    const n = raw === null ? NaN : Number(raw);
    if (Number.isFinite(n) && n >= 0 && n <= 100000) setFromUrl(n);
  }, []);

  return (
    <ExplainerPage
      content={content}
      crumbs={[{ href: "/lfp/individual", label: t.chrome.individual.crumb }, { label: content.crumb }]}
      sources={data?.irs ? [data.irs.meta] : []}
      widgets={{
        brackets:
          data?.irs && data?.tsu ? (
            <BracketTable irs={data.irs} tsu={data.tsu} initialBruto={fromUrl} />
          ) : null,
      }}
    />
  );
}
