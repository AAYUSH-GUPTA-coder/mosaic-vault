import type { NextRequest } from "next/server";
import { getAddress } from "viem";
import { AUTH_RATE_LIMIT, consumeToken } from "@/app/api/_lib/rate-limit";
import { clientIp, fail, handle, ok, parseJson } from "@/app/api/_lib/http";
import { nonceBodySchema } from "@/app/api/_lib/validation";
import { buildSignInMessage } from "@/lib/auth/message";
import { issueNonce } from "@/lib/auth/nonce";
import { getAppUrl, getChainId, isSupabaseConfigured } from "@/lib/database/env";
import { getServiceClient } from "@/lib/database/server";
import type { NonceResponse } from "@/types/api";


export const POST = handle(async (req: NextRequest) => {
  if (!consumeToken(`nonce:${clientIp(req)}`, AUTH_RATE_LIMIT)) {
    return fail(429, "RATE_LIMITED", "Too many requests; try again in a minute");
  }
  const { address } = await parseJson(req, nonceBodySchema);
  const db = getServiceClient();
  const { nonce, issuedAt, expiresAt } = await issueNonce(db, address);
  const origin = req.headers.get("origin") ?? getAppUrl();
  const message = buildSignInMessage({
    address: getAddress(address),
    origin,
    chainId: getChainId(),
    nonce,
    issuedAt,
    expirationTime: expiresAt,
  });
  const data: NonceResponse = { nonce, message, expiresAt };
  return ok(data, isSupabaseConfigured() && db ? "supabase" : "unconfigured");
});
