import type { Metadata } from "next";

export const metadata: Metadata = { title: "Conta corrente" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
