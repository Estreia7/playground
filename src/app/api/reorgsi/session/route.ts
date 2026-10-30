import { checkPassword, clearCookie, createSessionToken, requireAccess, sessionCookie } from "../auth.ts";

export const dynamic = "force-dynamic";

/** Is this browser signed in? */
export async function GET(request: Request) {
  return Response.json({ signedIn: await requireAccess(request) }, { headers: { "Cache-Control": "no-store" } });
}

/** `{ password }` signs in; `{ action: "logout" }` signs out. */
export async function POST(request: Request) {
  let body: { password?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "badRequest" }, { status: 400 });
  }

  if (body.action === "logout") {
    return Response.json({ signedIn: false }, { headers: { "Set-Cookie": clearCookie() } });
  }

  if (typeof body.password !== "string" || !checkPassword(body.password)) {
    // A short pause makes guessing slow without bothering a person who mistyped.
    await new Promise((r) => setTimeout(r, 600));
    return Response.json({ error: "wrongPassword" }, { status: 401 });
  }

  return Response.json(
    { signedIn: true },
    { headers: { "Set-Cookie": sessionCookie(await createSessionToken()) } },
  );
}
