import type { Metadata } from "next";
import IrsExplainer from "./IrsExplainer";

export const metadata: Metadata = {
  title: "IRS explicado",
  description:
    "O que é o IRS, porque é progressivo, como funciona a retenção na fonte e porque subir de escalão nunca te faz ganhar menos — com as tabelas de 2026 e o teu salário.",
};

export default function IrsPage() {
  return <IrsExplainer />;
}
