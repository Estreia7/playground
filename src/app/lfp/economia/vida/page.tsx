import type { Metadata } from "next";
import VidaView from "./VidaView";

export const metadata: Metadata = {
  title: "Linha da vida",
  description:
    "Do salário de hoje à reforma: uma projeção em euros de hoje e de amanhã, com a idade normal de reforma de 2026 e a pensão como hipótese explícita.",
};

export default function VidaPage() {
  return <VidaView />;
}
