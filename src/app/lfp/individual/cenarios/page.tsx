import type { Metadata } from "next";
import CenariosView from "./CenariosView";

export const metadata: Metadata = {
  title: "Comparar cenários",
  description:
    "1 400 € × 14 ou 1 600 € × 12? Compara duas propostas de salário lado a lado, com o mesmo cálculo de IRS e Segurança Social, e vê o que entra na conta ao fim do ano.",
};

export default function CenariosPage() {
  return <CenariosView />;
}
