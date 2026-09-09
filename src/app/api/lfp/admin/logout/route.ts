import { clearCookie } from "../../auth";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json({ ok: true }, { headers: { "set-cookie": clearCookie() } });
}
