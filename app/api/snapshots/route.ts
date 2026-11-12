import type { NextRequest } from "next/server";
import { handle, ok, parseQuery } from "@/app/api/_lib/http";
import { snapshotsQuerySchema } from "@/app/api/_lib/validation";
import { getChainId } from "@/lib/database/env";
import { listSnapshots } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { RiskSnapshot } from "@/types/api";


export const GET = handle(async (req: NextRequest) => {
  const q = parseQuery(req, snapshotsQuerySchema);
  const db = getServiceClient();
  if (!db) return ok<RiskSnapshot[]>([], "unconfigured");
  const rows = await listSnapshots(db, { chainId: getChainId(), ...q });
  return ok(rows, "supabase");
});
