import type { Metadata } from "next";
import ImpostosView from "./ImpostosView";

export const metadata: Metadata = {
  title: "Recibo do contribuinte",
  description:
    "Dos impostos que pagas todos os meses, quanto vai para pensões, saúde e educação? O teu recibo do contribuinte.",
};

export default function ImpostosPage() {
  return <ImpostosView />;
}
