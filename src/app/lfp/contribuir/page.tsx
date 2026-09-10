import type { Metadata } from "next";
import ContribuirView from "./ContribuirView";

export const metadata: Metadata = {
  title: "Contribuir",
  description:
    "Viste um erro ou um valor desatualizado? Envia a correção com a fonte. Lemos e respondemos a todas.",
};

export default function ContribuirPage() {
  return <ContribuirView />;
}
