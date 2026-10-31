import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { App } from "./ui/App.tsx";
import "./theme.css";

const sans = localFont({
  src: "../../fonts/schibsted-grotesk.woff2",
  variable: "--font-rs",
  weight: "400 900",
});

export const metadata: Metadata = {
  title: "ReorgSI",
  description: "Equipa, negócios, comissões e conta-corrente da Direção Comercial.",
  robots: { index: false, follow: false },
  // Added to an iPhone home screen, ReorgSI opens as an app: no Safari bars.
  manifest: "/reorgsi/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ReorgSI", statusBarStyle: "default" },
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  // Lets the tab bar sit above the home indicator via env(safe-area-inset-bottom).
  viewportFit: "cover",
  themeColor: "#eef5f3",
};

export default function ReorgLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className={`rs ${sans.variable}`}>
      <App>{children}</App>
    </div>
  );
}
