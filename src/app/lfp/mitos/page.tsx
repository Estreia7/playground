import type { Metadata } from "next";
import MitosView from "./MitosView";

export const metadata: Metadata = {
  title: "Mitos fiscais",
  description:
    "«Subir de escalão faz-me ganhar menos», «o IVA pagam-no as empresas», «uma casa custa o preço». Verdade ou mito? Cada resposta com a fonte oficial.",
};

export default function MitosPage() {
  return <MitosView />;
}
