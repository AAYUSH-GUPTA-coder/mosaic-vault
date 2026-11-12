import { NextResponse } from "next/server";
import { handle } from "@/app/api/_lib/http";
import { clearedSessionCookie } from "@/lib/auth/session";
import type { ApiOk } from "@/types/api";


export const POST = handle(async () => {
  const body: ApiOk<{ loggedOut: true }> = { ok: true, data: { loggedOut: true } };
  const res = NextResponse.json(body);
  res.cookies.set(clearedSessionCookie());
  return res;
});
