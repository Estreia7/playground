import type { Metadata } from "next";
import HomeView from "./HomeView";

export const metadata: Metadata = {
  title: "LFP — Literacia Financeira Portuguesa",
  description:
    "Aprende como funciona o dinheiro em Portugal: IRS, IVA, IRC, Segurança Social, inflação e poder de compra. Calculadoras e explicações simples, com fontes públicas.",
};

export default function LfpPage() {
  return <HomeView />;
}
