import type { Metadata } from "next";
import AumentoView from "./AumentoView";

export const metadata: Metadata = {
  title: "Aumento vs. inflação",
  description:
    "O teu aumento foi mesmo um aumento? Compara-o com a inflação em Portugal e vê o que sobra em poder de compra — e quanto fica no IRS.",
};

export default function AumentoPage() {
  return <AumentoView />;
}
