import { readAlerts, markAlertsSeen } from "../scan.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const alerts = await readAlerts();
  return Response.json({ alerts, unseen: alerts.filter((a) => !a.seen).length });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) {
    return Response.json({ error: "Expected { ids: string[] }." }, { status: 400 });
  }

  const alerts = await markAlertsSeen(ids as string[]);
  return Response.json({ alerts, unseen: alerts.filter((a) => !a.seen).length });
}
