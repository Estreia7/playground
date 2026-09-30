import type { Metadata, Viewport } from "next";
import { PadelProvider } from "./ui/PadelProvider";
import "./padel.css";

/* What a link to this app looks like when it lands in a chat.

   WhatsApp and friends read the Open Graph tags, and they ignore relative image
   URLs — hence metadataBase, which makes every path below absolute. The preview
   image is 1200×630, the ratio that gets the LARGE card; anything squarer falls
   back to a small thumbnail beside the text.

   The tab title is deliberately short and warm rather than descriptive: it is
   read in a strip of tabs and a share sheet, where "Bora Padel" says what it is
   and how to feel about it in two words. */

const TITLE = "Bora Padel 🎾";
const DESCRIPTION = "Sorteia as duplas, marca os resultados e descobre quem manda no ranking.";

export const metadata: Metadata = {
  metadataBase: new URL("https://playground.bruno-dev.xyz"),
  title: {
    default: TITLE,
    template: "%s · Padel",
  },
  description: DESCRIPTION,
  applicationName: "Bora Padel",
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "Bora Padel",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/padel-og.png", width: 1200, height: 630, alt: "Bora Padel — torneios e ranking" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/padel-og.png"],
  },
  // Declared explicitly rather than left to a file convention: the playground's
  // own favicon is emitted on every route and would otherwise come first, so
  // which icon a browser picked would be up to its own heuristics.
  icons: {
    icon: [
      { url: "/padel-icon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/padel-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/padel-icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/padel-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/padel-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/padel-apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { title: "Bora Padel" },
};

export const viewport: Viewport = {
  themeColor: "#0b1823",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function PadelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="pd min-h-dvh bg-zinc-950 text-zinc-100 [-webkit-tap-highlight-color:transparent]">
      <PadelProvider>{children}</PadelProvider>
    </div>
  );
}
