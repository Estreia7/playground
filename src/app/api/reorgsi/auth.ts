import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

/* Access gate for ReorgSI.

   Modelled on the FX Lab gate. The password is fixed for now ("Reorgsi2026"),
   with REORGSI_ACCESS_PASSWORD able to replace it on a server without a code
   change. The cookie has no Max-Age, so it dies with the browser: opening the
   project fresh always starts at the password page. Tokens also expire after
   twelve hours, for a browser that is never closed.

   The signing key is random, created on first use and kept next to the data
   (storage/reorgsi/session.key, git-ignored), so it is not in the source. */

const COOKIE_NAME = "reorgsi_session";
const TOKEN_HOURS = 12;
const DEFAULT_PASSWORD = "Reorgsi2026";
const KEY_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "reorgsi", "session.key");

const KEY_HOLDER = Symbol.for("playground.reorgsi.key");

async function secret(): Promise<string> {
  const holder = globalThis as unknown as Record<symbol, Promise<string> | undefined>;
  if (process.env.REORGSI_SESSION_SECRET) return process.env.REORGSI_SESSION_SECRET;
  holder[KEY_HOLDER] ??= (async () => {
    try {
      const key = (await fs.readFile(KEY_FILE, "utf-8")).trim();
      if (key.length >= 32) return key;
    } catch {
      // first run
    }
    const key = crypto.randomBytes(32).toString("base64url");
    await fs.mkdir(path.dirname(KEY_FILE), { recursive: true });
    await fs.writeFile(KEY_FILE, key, "utf-8");
    return key;
  })();
  return holder[KEY_HOLDER];
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function checkPassword(password: string): boolean {
  return safeEqual(password, process.env.REORGSI_ACCESS_PASSWORD || DEFAULT_PASSWORD);
}

function sign(payload: string, key: string): string {
  return crypto.createHmac("sha256", key).update(payload).digest("base64url");
}

/** Token is `<expiry>.<hmac>`; the signature covers the expiry. */
export async function createSessionToken(): Promise<string> {
  const payload = String(Date.now() + TOKEN_HOURS * 3600 * 1000);
  return payload + "." + sign(payload, await secret());
}

async function verifySessionToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(payload, await secret());
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

/** Server-side gate for every route that reads or writes ReorgSI data. */
export async function requireAccess(request: Request): Promise<boolean> {
  return verifySessionToken(readCookie(request, COOKIE_NAME));
}

export function sessionCookie(token: string): string {
  return [
    COOKIE_NAME + "=" + encodeURIComponent(token),
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export function clearCookie(): string {
  return COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
