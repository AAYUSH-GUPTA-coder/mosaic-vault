import { NextResponse, type NextRequest } from "next/server";
import { verifyMessage } from "viem";
import { AUTH_RATE_LIMIT, consumeToken } from "@/app/api/_lib/rate-limit";
import { clientIp, fail, handle, parseJson } from "@/app/api/_lib/http";
import { verifyBodySchema } from "@/app/api/_lib/validation";
import { parseSignInMessage } from "@/lib/auth/message";
import { consumeNonce } from "@/lib/auth/nonce";
import { createSessionToken, sessionCookie } from "@/lib/auth/session";
import { getChainId, isSupabaseConfigured } from "@/lib/database/env";
import { upsertUser } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { ApiOk, SessionResponse } from "@/types/api";


const NONCE_ERRORS: Record<string, { code: string; message: string }> = {
  not_found: { code: "NONCE_UNKNOWN", message: "Unknown nonce; request a new one" },
  used: { code: "NONCE_USED", message: "This sign-in message was already used" },
  expired: { code: "NONCE_EXPIRED", message: "Sign-in message expired; request a new one" },
  address_mismatch: { code: "NONCE_ADDRESS_MISMATCH", message: "Nonce was issued to a different address" },
};

export const POST = handle(async (req: NextRequest) => {
  if (!consumeToken(`verify:${clientIp(req)}`, AUTH_RATE_LIMIT)) {
    return fail(429, "RATE_LIMITED", "Too many requests; try again in a minute");
  }
  const { address, message, signature } = await parseJson(req, verifyBodySchema);

  const parsed = parseSignInMessage(message);
  if (!parsed) return fail(400, "BAD_MESSAGE", "Message does not match the Mosaic Vault sign-in format");
  if (parsed.chainId !== getChainId()) {
    return fail(400, "BAD_CHAIN_ID", `Message chain id ${parsed.chainId} does not match ${getChainId()}`);
  }
  if (parsed.address.toLowerCase() !== address) {
    return fail(400, "ADDRESS_MISMATCH", "Message address does not match the supplied address");
  }
  const now = Date.now();
  if (Date.parse(parsed.expirationTime) <= now) {
    return fail(401, "NONCE_EXPIRED", NONCE_ERRORS.expired.message);
  }

  let valid = false;
  try {
    valid = await verifyMessage({ address: parsed.address as `0x${string}`, message, signature: signature as `0x${string}` });
  } catch {
    valid = false;
  }
  if (!valid) return fail(401, "BAD_SIGNATURE", "Signature does not match the address");

  const db = getServiceClient();
  const check = await consumeNonce(db, parsed.nonce, address, now);
  if (check !== "ok") {
    const e = NONCE_ERRORS[check];
    return fail(401, e.code, e.message);
  }

  if (db) await upsertUser(db, address);

  const token = await createSessionToken(address);
  const body: ApiOk<SessionResponse> = {
    ok: true,
    data: { address },
    source: isSupabaseConfigured() && db ? "supabase" : "unconfigured",
  };
  const res = NextResponse.json(body, { status: 200 });
  res.cookies.set(sessionCookie(token));
  return res;
});
