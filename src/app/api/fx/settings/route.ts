import { readSettings, writeSettings, validateSettings, mergeSettings } from "../settings.ts";
import { requireAccess } from "../auth.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ settings: await readSettings() });
}

export async function PUT(request: Request) {
  if (!(await requireAccess(request))) {
    return Response.json({ error: "Not authorised." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const issues = validateSettings(body);
  if (issues.length > 0) {
    return Response.json({ error: "Those settings cannot be saved.", issues }, { status: 400 });
  }

  const current = await readSettings();
  const merged = mergeSettings(current, body as Record<string, never>);
  await writeSettings(merged);
  return Response.json({ settings: merged });
}
