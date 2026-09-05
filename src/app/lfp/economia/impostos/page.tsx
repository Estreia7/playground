import type { Metadata } from "next";
import ImpostosView from "./ImpostosView";

export const metadata: Metadata = {
  title: "Recibo do contribuinte",
  description:
    "Dos euros que entregas ao Estado todos os meses em IRS e Segurança Social, quantos vão para pensões, saúde, educação? O teu recibo, com a despesa pública do Eurostat.",
};

export default function ImpostosPage() {
  return <ImpostosView />;
}
