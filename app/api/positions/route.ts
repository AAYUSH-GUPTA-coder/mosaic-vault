import type { NextRequest } from "next/server";
import { handle, ok, parseQuery } from "@/app/api/_lib/http";
import { positionsQuerySchema } from "@/app/api/_lib/validation";
import { getChainId } from "@/lib/database/env";
import { listPositions } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { PositionIndex } from "@/types/api";


export const GET = handle(async (req: NextRequest) => {
  const { wallet } = parseQuery(req, positionsQuerySchema);
  const db = getServiceClient();
  if (!db) return ok<PositionIndex[]>([], "unconfigured");
  const rows = await listPositions(db, { chainId: getChainId(), wallet });
  return ok(rows, "supabase");
});
