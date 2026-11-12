import type { NextRequest } from "next/server";
import { handle, ok, parseQuery } from "@/app/api/_lib/http";
import { eventsQuerySchema } from "@/app/api/_lib/validation";
import { getChainId } from "@/lib/database/env";
import { listEvents } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { IndexedEvent } from "@/types/api";


export const GET = handle(async (req: NextRequest) => {
  const q = parseQuery(req, eventsQuerySchema);
  const db = getServiceClient();
  if (!db) return ok<IndexedEvent[]>([], "unconfigured", { nextCursor: null });
  const { rows, nextCursor } = await listEvents(db, { chainId: getChainId(), ...q });
  return ok(rows, "supabase", { nextCursor });
});
