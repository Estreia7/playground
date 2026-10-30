import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import { App } from "./ui/App.tsx";
import "./theme.css";

const sans = Schibsted_Grotesk({
  variable: "--font-rs",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "ReorgSI",
  description: "Equipa, negócios, comissões e conta-corrente da Direção Comercial.",
  robots: { index: false, follow: false },
};

export default function ReorgLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`rs ${sans.variable}`}>
      <App>{children}</App>
    </div>
  );
}
