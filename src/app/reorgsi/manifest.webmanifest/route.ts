/* Web app manifest for ReorgSI alone (the file convention only exists at the
   app root, which is the whole playground). "standalone" is what makes the
   home-screen shortcut open without the browser's bars; the scope keeps the
   app inside /reorgsi. Served under /reorgsi so the subdomain proxies it. */

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "ReorgSI — Direção Comercial",
      short_name: "ReorgSI",
      description: "Equipa, negócios, comissões e conta-corrente da Direção Comercial.",
      start_url: "/reorgsi",
      scope: "/reorgsi",
      id: "/reorgsi",
      display: "standalone",
      orientation: "portrait",
      background_color: "#112031",
      theme_color: "#eef5f3",
      lang: "pt-PT",
      icons: [{ src: "/reorgsi/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" }],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
