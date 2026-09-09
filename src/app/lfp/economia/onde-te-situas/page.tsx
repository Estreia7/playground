import type { Metadata } from "next";
import SituasView from "./SituasView";

export const metadata: Metadata = {
  title: "Onde te situas",
  description:
    "Ganhas mais do que que percentagem dos portugueses? Com a distribuição oficial dos salários — 1.º decil, mediana e 9.º decil — e o intervalo em que estás, sem falsa precisão.",
};

export default function SituasPage() {
  return <SituasView />;
}
