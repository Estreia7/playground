import type { Metadata } from "next";
import MitosView from "./MitosView";

export const metadata: Metadata = {
  title: "Mitos fiscais",
  description:
    "«Subir de escalão faz-me ganhar menos.» Verdade ou mito? Treze ideias feitas, cada uma com a fonte oficial.",
};

export default function MitosPage() {
  return <MitosView />;
}
