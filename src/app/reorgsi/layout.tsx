import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { App } from "./ui/App.tsx";
import "./theme.css";

const sans = localFont({
  src: "../../fonts/schibsted-grotesk.woff2",
  variable: "--font-rs",
  weight: "400 900",
});

const TITLE = "ReorgSI · Gestão comercial imobiliária";
// What a shared link says (WhatsApp, iMessage, Slack…): the app, never a person.
const DESCRIPTION =
  "Negócios, documentos, comissões e faturação da equipa num só painel. Saiba o que falta em cada processo e acompanhe os resultados em tempo real.";

export const metadata: Metadata = {
  metadataBase: new URL("https://reorgsi.bruno-dev.xyz"),
  title: { default: TITLE, template: "%s · ReorgSI" },
  description: DESCRIPTION,
  applicationName: "ReorgSI",
  // A private tool behind a password: previews yes, search results no.
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: "/reorgsi/favicon.png", type: "image/png", sizes: "96x96" }],
    apple: [{ url: "/reorgsi/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: "/reorgsi",
    siteName: "ReorgSI",
    locale: "pt_PT",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/reorgsi/og.jpg", width: 600, height: 600, alt: "Logótipo ReorgSI: uma casa em órbita" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/reorgsi/og.jpg"] },
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
