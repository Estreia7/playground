"use client";

import { ExplainerPage } from "../../explainers/ExplainerLayout";
import { TsuSplit } from "../../explainers/TsuSplit";
import { useLfpData } from "../../useLfpData";
import { useLfpLang } from "../../useLfpLang";

export default function TsuExplainer() {
  const { data } = useLfpData();
  const { t } = useLfpLang();
  const content = t.explainers.tsu;

  return (
    <ExplainerPage
      content={content}
      crumbs={[{ href: "/lfp/individual", label: t.chrome.individual.crumb }, { label: content.crumb }]}
      sources={data?.tsu ? [data.tsu.meta] : []}
      widgets={{ tsuSplit: data?.tsu ? <TsuSplit tsu={data.tsu} /> : null }}
    />
  );
}
