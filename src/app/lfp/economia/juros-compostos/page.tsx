import type { Metadata } from "next";
import JurosView from "./JurosView";

export const metadata: Metadata = {
  title: "Juros compostos",
  description:
    "O que 100 € por mês se tornam em 10, 20 ou 30 anos. Calculadora de juros compostos com a curva do crescimento e a conta linha a linha.",
};

export default function JurosPage() {
  return <JurosView />;
}
