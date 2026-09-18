import {
  checkPassword,
  createSessionToken,
  sessionCookie,
  clearCookie,
  requireAccess,
  isConfigured,
} from "../auth.ts";

export const dynamic = "force-dynamic";

/** Is this browser already signed in? */
export async function GET(request: Request) {
  return Response.json({
    signedIn: await requireAccess(request),
    configured: isConfigured(),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const action = (body as { action?: unknown }).action;

  if (action === "logout") {
    return Response.json({ signedIn: false }, { headers: { "Set-Cookie": clearCookie() } });
  }

  if (!isConfigured()) {
    return Response.json(
      { error: "No access password is configured on the server." },
      { status: 503 },
    );
  }

  const password = (body as { password?: unknown }).password;
  if (typeof password !== "string" || !checkPassword(password)) {
    return Response.json({ error: "That password is not right." }, { status: 401 });
  }

  const token = createSessionToken();
  if (!token) {
    return Response.json({ error: "Sessions are not configured." }, { status: 503 });
  }

  return Response.json({ signedIn: true }, { headers: { "Set-Cookie": sessionCookie(token) } });
}
