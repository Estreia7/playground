import type { Metadata } from "next";
import IvaTool from "./IvaTool";

export const metadata: Metadata = {
  title: "IVA",
  description:
    "Tirar o IVA não é tirar 23%. Calcula nos dois sentidos e vê o erro que quase toda a gente faz.",
};

export default function IvaPage() {
  return <IvaTool />;
}
