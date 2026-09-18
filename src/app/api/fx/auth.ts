import crypto from "crypto";

/* Access gate for the FX Lab.

   The playground is public, but this experiment can spend a metered API
   allowance, rewrite the scan settings and move money around a paper account.
   None of that should be open to whoever finds the URL.

   Modelled on the LFP admin session but simpler: one password, no username,
   and a month-long cookie, because this is a personal tool rather than a
   backoffice. Like LFP it fails closed — with no password configured, nothing
   is authorised, so a deploy that forgets the environment variable has no
   access rather than open access. */

const COOKIE_NAME = "fx_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret(): string | null {
  return process.env.FX_SESSION_SECRET || process.env.FX_ACCESS_PASSWORD || null;
}

export function isConfigured(): boolean {
  return Boolean(process.env.FX_ACCESS_PASSWORD);
}

/** Constant-time compare that tolerates differing lengths without leaking
 *  them through an early return. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(password: string): boolean {
  const expected = process.env.FX_ACCESS_PASSWORD;
  if (!expected) return false;
  return safeEqual(password, expected);
}

function sign(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

/** Token is `<expiry>.<hmac>`; the signature covers the expiry, so it cannot
 *  be extended by editing the cookie. */
export function createSessionToken(): string | null {
  const key = secret();
  if (!key) return null;
  const expires = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = String(expires);
  return payload + "." + sign(payload, key);
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const key = secret();
  if (!key || !token) return false;

  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;

  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(payload, key);

  if (provided.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return false;

  const expires = Number(payload);
  return Number.isFinite(expires) && Date.now() < expires;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/** Server-side gate for every mutating route. The client never decides this. */
export async function requireAccess(request: Request): Promise<boolean> {
  return verifySessionToken(readCookie(request, COOKIE_NAME));
}

export function sessionCookie(token: string): string {
  return [
    COOKIE_NAME + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    "Max-Age=" + MAX_AGE_SECONDS,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCookie(): string {
  return COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

export { COOKIE_NAME };
