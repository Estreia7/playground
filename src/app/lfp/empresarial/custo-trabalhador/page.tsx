import type { Metadata } from "next";
import CustoTrabalhadorCalculator from "./CustoTrabalhadorCalculator";

export const metadata: Metadata = {
  title: "Custo de um trabalhador",
  description:
    "Quanto custa mesmo um trabalhador à empresa em 2026: salário bruto, Segurança Social patronal, seguro de acidentes — e a fatia entre o que a empresa paga e o que o trabalhador recebe.",
};

export default function CustoTrabalhadorPage() {
  return <CustoTrabalhadorCalculator />;
}
