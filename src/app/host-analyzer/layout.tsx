import type { Metadata } from "next";
import { Sora, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import "./theme.css";

const display = Sora({
  variable: "--font-ha-display",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const body = Instrument_Sans({
  variable: "--font-ha-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ha-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
