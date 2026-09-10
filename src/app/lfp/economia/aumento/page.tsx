import type { Metadata } from "next";
import AumentoView from "./AumentoView";

export const metadata: Metadata = {
  title: "Aumento vs. inflação",
  description:
    "3% de aumento num ano de 4% de inflação é um corte. Vê o que sobra mesmo, depois dos preços e do IRS.",
};

export default function AumentoPage() {
  return <AumentoView />;
}
