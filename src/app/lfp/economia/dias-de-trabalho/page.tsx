import type { Metadata } from "next";
import DiasView from "./DiasView";

type Props = { searchParams: Promise<{ [key: string]: string | string[] | undefined }> };

const TITLE = "Dias de trabalho";
const DESCRIPTION =
  "Quantos dias de salário líquido custa um telemóvel, uma renda ou um carro em Portugal — e em mais dezanove países europeus, em poder de compra ou euros nominais.";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const n = Number(sp.price);
  const price = Number.isFinite(n) && n >= 0 && n <= 100000000 ? Math.round(n) : 1000;
  const unit = sp.unit === "eur" ? "eur" : "pps";
  const image = `/api/lfp/og/dias?price=${price}&unit=${unit}&lang=pt`;
  return {
    title: TITLE,
    description: DESCRIPTION,
    openGraph: { title: `${TITLE} · LFP`, description: DESCRIPTION, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function DiasPage() {
  return <DiasView />;
}
