import type { Metadata } from "next";
import JurosView from "./JurosView";

export const metadata: Metadata = {
  title: "Juros compostos",
  description:
    "100 € por mês durante 30 anos tornam-se cerca de 83.000 €. Vê a curva — e porque o tempo vale mais que a taxa.",
};

export default function JurosPage() {
  return <JurosView />;
}
