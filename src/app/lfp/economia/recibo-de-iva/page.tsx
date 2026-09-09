import type { Metadata } from "next";
import CestoView from "./CestoView";

export const metadata: Metadata = {
  title: "Recibo de IVA",
  description:
    "Um carrinho de supermercado dividido por taxa de IVA — 6%, 13%, 23%. Quanto do que pagas é imposto, com as taxas de 2026.",
};

export default function CestoPage() {
  return <CestoView />;
}
