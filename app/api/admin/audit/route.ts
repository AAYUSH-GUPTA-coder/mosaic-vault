import type { NextRequest } from "next/server";
import { handle, ok, parseJson, parseQuery } from "@/app/api/_lib/http";
import { auditBodySchema, auditQuerySchema } from "@/app/api/_lib/validation";
import { ApiError } from "@/lib/auth/errors";
import { isManager } from "@/lib/auth/manager";
import { requireSession, type Session } from "@/lib/auth/session";
import { insertAuditLog, listAuditLogs } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { AuditLog } from "@/types/api";


async function requireManager(req: Request): Promise<Session> {
  const session = await requireSession(req);
  if (!(await isManager(session.address))) {
    throw new ApiError(403, "FORBIDDEN", "Wallet does not hold RISK_MANAGER_ROLE on the registry");
  }
  return session;
}

export const GET = handle(async (req: NextRequest) => {
  await requireManager(req);
  const { limit } = parseQuery(req, auditQuerySchema);
  const db = getServiceClient();
  if (!db) return ok<AuditLog[]>([], "unconfigured");
  return ok(await listAuditLogs(db, limit), "supabase");
});

export const POST = handle(async (req: NextRequest) => {
  const session = await requireManager(req);
  const body = await parseJson(req, auditBodySchema);
  const db = getServiceClient();
  if (!db) return ok<AuditLog | null>(null, "unconfigured");
  const row = await insertAuditLog(db, {
    actor: session.address,
    action: body.action,
    target: body.target ?? null,
    metadata: body.metadata ?? {},
  });
  return ok(row, "supabase", { status: 201 });
});
