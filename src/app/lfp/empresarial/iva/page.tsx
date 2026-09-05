import type { Metadata } from "next";
import IvaTool from "./IvaTool";

export const metadata: Metadata = {
  title: "IVA",
  description:
    "Calcula o IVA nas duas direções — com e sem IVA — para qualquer taxa e região, e vê o erro clássico ao tirar o IVA de um preço.",
};

export default function IvaPage() {
  return <IvaTool />;
}
