import type { Metadata } from "next";
import OrcamentoView from "./OrcamentoView";

export const metadata: Metadata = {
  title: "Orçamento familiar",
  description:
    "Compara a estrutura do teu orçamento com a das famílias portuguesas do mesmo escalão de rendimento, com o Inquérito às Despesas das Famílias.",
};

export default function OrcamentoPage() {
  return <OrcamentoView />;
}
