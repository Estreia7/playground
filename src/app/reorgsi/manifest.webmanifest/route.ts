/* Web app manifest for ReorgSI alone (the file convention only exists at the
   app root, which is the whole playground). "standalone" is what makes the
   home-screen shortcut open without the browser's bars; the scope keeps the
   app inside /reorgsi. Served under /reorgsi so the subdomain proxies it. */

export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      name: "ReorgSI · Gestão comercial imobiliária",
      short_name: "ReorgSI",
      description: "Negócios, documentos, comissões e faturação da equipa num só painel.",
      start_url: "/reorgsi",
      scope: "/reorgsi",
      id: "/reorgsi",
      display: "standalone",
      orientation: "portrait",
      background_color: "#112031",
      theme_color: "#eef5f3",
      lang: "pt-PT",
      icons: [
        { src: "/reorgsi/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/reorgsi/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        // The circle sits inside the 80% safe zone, so Android can crop it to any shape.
        { src: "/reorgsi/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
