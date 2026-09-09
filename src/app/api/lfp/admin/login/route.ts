import { checkCredentials, createSessionToken, sessionCookie } from "../../auth";

export const dynamic = "force-dynamic";

/** Username + password from the environment → signed httpOnly cookie.
 *  A wrong attempt waits a moment before answering, which is enough to
 *  make guessing slow without a lockout table. */
export async function POST(request: Request) {
  let body: { user?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }

  const user = typeof body.user === "string" ? body.user : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!checkCredentials(user, password)) {
    await new Promise((r) => setTimeout(r, 800));
    return Response.json({ error: "Credenciais inválidas" }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) return Response.json({ error: "Admin não configurado" }, { status: 503 });

  return Response.json(
    { ok: true },
    { headers: { "set-cookie": sessionCookie(token) } }
  );
}
