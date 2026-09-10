import type { Metadata } from "next";
import CustoTrabalhadorCalculator from "./CustoTrabalhadorCalculator";

export const metadata: Metadata = {
  title: "Custo de um trabalhador",
  description:
    "Um salário de 1.000 € custa quase 1.300 € à empresa. Vê a conta completa: Segurança Social patronal, seguros, subsídios.",
};

export default function CustoTrabalhadorPage() {
  return <CustoTrabalhadorCalculator />;
}
