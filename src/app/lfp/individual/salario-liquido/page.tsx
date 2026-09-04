import type { Metadata } from "next";
import SalarioLiquidoCalculator from "./SalarioLiquidoCalculator";

export const metadata: Metadata = {
  title: "Salário líquido",
  description:
    "Calcula o teu salário líquido em 2026: IRS retido na fonte, Segurança Social, subsídio de refeição e dependentes. Vê para onde vai cada euro.",
};

export default function SalarioLiquidoPage() {
  return <SalarioLiquidoCalculator />;
}
