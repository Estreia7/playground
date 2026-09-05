import type { Metadata } from "next";
import TsuExplainer from "./TsuExplainer";

export const metadata: Metadata = {
  title: "Segurança Social explicada",
  description:
    "Os 11% que descontas e os 23,75% que a empresa paga por cima: para onde vão, o que te dão em troca, e como contam para a tua reforma.",
};

export default function TsuPage() {
  return <TsuExplainer />;
}
