import type { Metadata } from "next";
import RecibosVerdesView from "./RecibosVerdesView";

export const metadata: Metadata = {
  title: "Recibos verdes ou contrato?",
  description:
    "O mesmo valor por contrato e a recibos verdes: Segurança Social a 21,4% sobre 70%, retenção de 25%, e o que perdes em férias, subsídios e proteção. Com as regras de 2026.",
};

export default function RecibosVerdesPage() {
  return <RecibosVerdesView />;
}
