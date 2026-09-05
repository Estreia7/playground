import type { Metadata } from "next";
import SalarioLiquidoCalculator from "./SalarioLiquidoCalculator";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const TITLE = "Salário líquido";
const DESCRIPTION =
  "Calcula o teu salário líquido em 2026: IRS retido na fonte, Segurança Social, subsídio de refeição e dependentes. Vê para onde vai cada euro.";

/** The share link carries the salary, so the page it opens unfurls the same
 *  card the sender saw. Only the input is read; the card recomputes. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const n = Number(sp.bruto);
  const bruto = Number.isFinite(n) && n >= 0 && n <= 100000 ? Math.round(n) : 1500;
  const image = `/api/lfp/og/salario?bruto=${bruto}&lang=pt`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: `${TITLE} · LFP`, description: DESCRIPTION, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function SalarioLiquidoPage() {
  return <SalarioLiquidoCalculator />;
}
