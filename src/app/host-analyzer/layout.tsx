import type { Metadata } from "next";
import localFont from "next/font/local";
import "./theme.css";

const display = localFont({
  src: "../../fonts/sora.woff2",
  variable: "--font-ha-display",
  weight: "100 800",
});

const body = localFont({
  src: "../../fonts/instrument-sans.woff2",
  variable: "--font-ha-body",
  weight: "400 700",
});

const mono = localFont({
  src: [
    { path: "../../fonts/ibm-plex-mono-400.woff2", weight: "400" },
    { path: "../../fonts/ibm-plex-mono-500.woff2", weight: "500" },
    { path: "../../fonts/ibm-plex-mono-600.woff2", weight: "600" },
  ],
  variable: "--font-ha-mono",
});

export const metadata: Metadata = {
  title: "Host Analyzer",
  description:
    "Airbnb host intelligence: listings, AL licenses, RNT registry, owners, insurance, ADR and acquisition funnel.",
};

export default function HostAnalyzerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`ha ${display.variable} ${body.variable} ${mono.variable}`}>
      {children}
    </div>
  );
}
