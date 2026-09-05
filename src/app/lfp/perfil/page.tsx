import type { Metadata } from "next";
import PerfilView from "./PerfilView";

export const metadata: Metadata = {
  title: "O teu progresso",
  description:
    "Dias seguidos, domínio por tema, patentes conquistadas e perguntas para rever. Tudo guardado no teu browser.",
  robots: { index: false },
};

export default function PerfilPage() {
  return <PerfilView />;
}
