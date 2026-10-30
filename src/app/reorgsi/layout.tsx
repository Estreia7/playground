import type { Metadata, Viewport } from "next";
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
