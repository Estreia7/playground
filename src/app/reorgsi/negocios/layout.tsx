import type { Metadata } from "next";

export const metadata: Metadata = { title: { default: "Negócios", template: "%s · ReorgSI" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
