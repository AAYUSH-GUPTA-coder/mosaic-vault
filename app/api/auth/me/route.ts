import type { NextRequest } from "next/server";
import { handle, ok } from "@/app/api/_lib/http";
import { requireSession } from "@/lib/auth/session";
import type { SessionResponse } from "@/types/api";


export const GET = handle(async (req: NextRequest) => {
  const session = await requireSession(req);
  const data: SessionResponse = { address: session.address };
  return ok(data);
});
