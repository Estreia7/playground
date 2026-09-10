import type { Metadata } from "next";
import TsuExplainer from "./TsuExplainer";

export const metadata: Metadata = {
  title: "Segurança Social explicada",
  description:
    "Descontas 11%, mas a empresa paga mais 23,75% por cima. Para onde vai esse dinheiro e o que te dá em troca.",
};

export default function TsuPage() {
  return <TsuExplainer />;
}
