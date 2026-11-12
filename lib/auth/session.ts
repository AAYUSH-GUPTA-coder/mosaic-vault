import { SignJWT, jwtVerify } from "jose";
import { getSessionSecret, isProduction } from "@/lib/database/env";
import { ApiError } from "@/lib/auth/errors";

/**
 * Session cookie `mv_session`: HS256 JWT `{ sub: address(lowercase), iat, exp }` signed with
 * SESSION_SECRET (>= 32 chars). httpOnly, sameSite=lax, secure in production, 7 days.
 */

export const SESSION_COOKIE = "mv_session";
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

const DEV_FALLBACK_SECRET = "mosaic-vault-dev-only-insecure-session-secret";
let warnedFallback = false;

function secretKey(): Uint8Array {
  let secret = getSessionSecret();
  if (secret.length < 32) {
    if (isProduction()) {
      throw new ApiError(500, "SESSION_SECRET_MISSING", "SESSION_SECRET must be set (>= 32 chars) in production");
    }
    if (!warnedFallback) {
      warnedFallback = true;
      console.warn("[auth] SESSION_SECRET missing or < 32 chars; using an insecure dev-only fallback");
    }
    secret = DEV_FALLBACK_SECRET;
  }
  return new TextEncoder().encode(secret);
}

export interface Session {
  address: string;
  issuedAt: number;
  expiresAt: number;
}

export async function createSessionToken(address: string, now: number = Math.floor(Date.now() / 1000)): Promise<string> {
  const sub = address.toLowerCase();
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(sub)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const sub = payload.sub;
    if (!sub || !/^0x[0-9a-f]{40}$/.test(sub) || !payload.iat || !payload.exp) return null;
    return { address: sub, issuedAt: payload.iat, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

export async function getSession(req: Request): Promise<Session | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return verifySessionToken(token);
}

export async function requireSession(req: Request): Promise<Session> {
  const session = await getSession(req);
  if (!session) throw new ApiError(401, "UNAUTHENTICATED", "Sign in with your wallet first");
  return session;
}

export interface CookieOptions {
  name: string;
  value: string;
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
}

export function sessionCookie(token: string): CookieOptions {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function clearedSessionCookie(): CookieOptions {
  return { ...sessionCookie(""), maxAge: 0 };
}
