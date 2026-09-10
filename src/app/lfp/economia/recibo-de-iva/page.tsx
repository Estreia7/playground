import type { Metadata } from "next";
import CestoView from "./CestoView";

export const metadata: Metadata = {
  title: "Recibo de IVA",
  description:
    "O pão paga 6%, a televisão 23%. Monta o teu carrinho e vê quanto do que pagas é imposto.",
};

export default function CestoPage() {
  return <CestoView />;
}
