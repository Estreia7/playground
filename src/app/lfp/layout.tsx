import type { Metadata } from "next";
import { Fraunces, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./theme.css";

// latin-ext carries the Portuguese diacritics (ã, ç, õ, ê).
// Variable font: `axes` requires the weight axis to stay variable, which also
// gives us WONK — the wonky serif forms that echo painted tile lettering.
const display = Fraunces({
  variable: "--font-lfp-display",
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "WONK", "opsz"],
});

const body = Public_Sans({
  variable: "--font-lfp-body",
  subsets: ["latin", "latin-ext"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-lfp-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  // Makes the share cards' og:image URLs absolute — WhatsApp and friends
  // ignore relative ones. Scoped to /lfp so the rest of the playground is
  // untouched.
  metadataBase: new URL("https://playground.bruno-dev.xyz"),
  title: {
    default: "LFP — Literacia Financeira Portuguesa",
    template: "%s · LFP",
  },
  description:
    "Aprende como funciona o dinheiro em Portugal: IRS, IVA, IRC, Segurança Social, inflação e poder de compra. Explicado de forma simples, com calculadoras e dados públicos.",
};

export default function LfpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lfp ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}
