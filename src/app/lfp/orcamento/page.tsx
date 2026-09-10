import type { Metadata } from "next";
import OrcamentoView from "./OrcamentoView";

export const metadata: Metadata = {
  title: "Orçamento familiar",
  description:
    "O teu orçamento ao lado do das famílias do mesmo rendimento. Onde gastas mais, categoria a categoria.",
};

export default function OrcamentoPage() {
  return <OrcamentoView />;
}
