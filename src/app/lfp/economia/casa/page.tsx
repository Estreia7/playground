import type { Metadata } from "next";
import CasaView from "./CasaView";

export const metadata: Metadata = {
  title: "Custo real de uma casa",
  description:
    "IMT, Imposto do Selo, registos, trinta anos de juros e de IMI: o que uma casa custa mesmo, no dia da escritura e no fim do crédito. Tabelas de 2026.",
};

export default function CasaPage() {
  return <CasaView />;
}
