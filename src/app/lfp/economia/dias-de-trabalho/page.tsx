import type { Metadata } from "next";
import DiasView from "./DiasView";

export const metadata: Metadata = {
  title: "Dias de trabalho",
  description:
    "Quantos dias de salário líquido custa um telemóvel, uma renda ou um carro em Portugal — e em mais dezanove países europeus, em poder de compra ou euros nominais.",
};

export default function DiasPage() {
  return <DiasView />;
}
