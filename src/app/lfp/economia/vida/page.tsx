import type { Metadata } from "next";
import VidaView from "./VidaView";

export const metadata: Metadata = {
  title: "Linha da vida",
  description:
    "Do salário de hoje à reforma: quanto vais receber, e quanto falta. Uma projeção honesta, em euros de hoje.",
};

export default function VidaPage() {
  return <VidaView />;
}
