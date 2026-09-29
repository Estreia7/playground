import type { Metadata, Viewport } from "next";
import { PadelProvider } from "./ui/PadelProvider";

export const metadata: Metadata = {
  title: {
    default: "Padel — torneios e ranking",
    template: "%s · Padel",
  },
  description: "Americano, Mexicano e equipas fixas: sorteio dos jogos, resultados no telemóvel e um ranking que se atualiza sozinho.",
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PadelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 [-webkit-tap-highlight-color:transparent]">
      <PadelProvider>{children}</PadelProvider>
    </div>
  );
}
