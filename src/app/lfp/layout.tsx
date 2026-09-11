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
  // WhatsApp shows about two lines under the title and cuts the rest
  // mid-word, so the hook has to land inside ~120 characters.
  description:
    "IRS, IVA, Segurança Social e inflação explicados em português simples — com calculadoras e fontes públicas.",
  // 1200×630, the ratio WhatsApp and Facebook need to render a LARGE
  // preview image; a square falls back to a small thumbnail beside the
  // text. Result pages override this with their own generated card
  // carrying the actual numbers — this is the fallback for the rest.
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "LFP — Literacia Financeira Portuguesa",
    images: [{ url: "/lfp-og.png", width: 1200, height: 630, alt: "Literacia Financeira Portuguesa" }],
  },
  twitter: { card: "summary_large_image", images: ["/lfp-og.png"] },
  // Declared explicitly rather than left to the icon.ico convention alone:
  // the playground's own /favicon.ico is still emitted on every route and
  // came FIRST in the head, so which one a browser picked was up to its
  // own heuristics. Listing the LFP icon here puts it ahead of the
  // inherited one, and the emblem is what shows in the tab.
  icons: {
    icon: [
      { url: "/lfp/icon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/lfp-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/lfp/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function LfpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lfp ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}
