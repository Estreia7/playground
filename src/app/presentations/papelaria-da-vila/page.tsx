import type { Metadata } from "next";
import Presentation from "./presentation";

export const metadata: Metadata = {
  title: "Papelaria da Vila — Aekios Services",
  description:
    "Interactive presentation: tailored software solutions for Papelaria da Vila by Aekios.",
};

export default function PapelariaPage() {
  return <Presentation />;
}
