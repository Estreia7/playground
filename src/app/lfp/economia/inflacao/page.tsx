import type { Metadata } from "next";
import InflacaoView from "./InflacaoView";

export const metadata: Metadata = {
  title: "Máquina do tempo da inflação",
  description:
    "Quanto vale hoje o dinheiro de 1999, 2010 ou 2020? Inflação em Portugal com o índice de preços do Eurostat desde 1996.",
};

export default function InflacaoPage() {
  return <InflacaoView />;
}
