import type { Metadata } from "next";
import RecibosVerdesView from "./RecibosVerdesView";

export const metadata: Metadata = {
  title: "Recibos verdes ou contrato?",
  description:
    "Recibos verdes ou contrato? A mesma quantia pelas duas vias, com o que perdes em férias, subsídios e proteção.",
};

export default function RecibosVerdesPage() {
  return <RecibosVerdesView />;
}
