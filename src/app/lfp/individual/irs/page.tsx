import type { Metadata } from "next";
import IrsExplainer from "./IrsExplainer";

export const metadata: Metadata = {
  title: "IRS explicado",
  description:
    "Porque é que subir de escalão nunca te faz ganhar menos — o IRS explicado por fatias, com as tabelas de 2026.",
};

export default function IrsPage() {
  return <IrsExplainer />;
}
