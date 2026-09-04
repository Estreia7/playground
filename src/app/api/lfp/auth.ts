import crypto from "crypto";

/* Admin session for the LFP backoffice.

   Credentials come from the environment, never from source: this account can
   rewrite the tax numbers the whole site teaches from, and hardcoding would
   commit the password to git. If LFP_ADMIN_PASSWORD is unset, every check
   fails closed — an unconfigured deploy has no admin, rather than a default
   one everybody knows. */

const COOKIE_NAME = "lfp_admin";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8h

function secret(): string | null {
  return process.env.LFP_SESSION_SECRET || process.env.LFP_ADMIN_PASSWORD || null;
}

/** Constant-time compare that tolerates differing lengths without leaking
 *  them through an early return. */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkCredentials(user: string, password: string): boolean {
  const expectedUser = process.env.LFP_ADMIN_USER;
  const expectedPassword = process.env.LFP_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPassword) return false;
  // Evaluate both so timing does not reveal which half was wrong.
  const okUser = safeEqual(user, expectedUser);
  const okPassword = safeEqual(password, expectedPassword);
  return okUser && okPassword;
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
  return `${payload}.${sign(payload, key)}`;
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
export async function verifyAdmin(request: Request): Promise<boolean> {
  return verifySessionToken(readCookie(request, COOKIE_NAME));
}

export function sessionCookie(token: string): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${MAX_AGE_SECONDS}`,
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

export { COOKIE_NAME };
