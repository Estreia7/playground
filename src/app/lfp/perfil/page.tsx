import type { Metadata } from "next";
import PerfilView from "./PerfilView";

export const metadata: Metadata = {
  title: "O teu progresso",
  description:
    "Dias seguidos, temas dominados e perguntas para rever. Tudo guardado no teu browser, sem conta.",
  robots: { index: false },
};

export default function PerfilPage() {
  return <PerfilView />;
}
