import type { Metadata } from "next";
import CasaView from "./CasaView";

export const metadata: Metadata = {
  title: "Custo real de uma casa",
  description:
    "Uma casa de 250.000 € custa perto de 390.000 €. IMT, selo, registos e trinta anos de juros, na mesma conta.",
};

export default function CasaPage() {
  return <CasaView />;
}
