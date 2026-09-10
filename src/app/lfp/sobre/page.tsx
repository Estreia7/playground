import type { Metadata } from "next";
import SobreView from "./SobreView";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "Como o LFP é feito: o método, a fonte de cada número, o que fica de fora, e como contribuir.",
};

export default function SobrePage() {
  return <SobreView />;
}
