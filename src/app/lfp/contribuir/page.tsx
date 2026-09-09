import type { Metadata } from "next";
import ContribuirView from "./ContribuirView";

export const metadata: Metadata = {
  title: "Contribuir",
  description:
    "Viste um erro ou um valor desatualizado? Envia uma proposta com a fonte oficial. Cada proposta é lida e respondida.",
};

export default function ContribuirPage() {
  return <ContribuirView />;
}
