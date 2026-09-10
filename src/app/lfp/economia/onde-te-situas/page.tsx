import type { Metadata } from "next";
import SituasView from "./SituasView";

export const metadata: Metadata = {
  title: "Onde te situas",
  description:
    "Ganhas mais do que quantos portugueses? Com a distribuição oficial dos salários — e o intervalo real, sem falsa precisão.",
};

export default function SituasPage() {
  return <SituasView />;
}
