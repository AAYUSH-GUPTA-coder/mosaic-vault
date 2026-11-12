import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { fail, handle } from "@/app/api/_lib/http";
import { getCronSecret, getIndexerSecret } from "@/lib/database/env";
import { runIndexer } from "@/lib/database/indexer";
import { getServiceClient } from "@/lib/database/server";
import type { ApiOk, IndexerRunResult } from "@/types/api";

export const maxDuration = 60;

function safeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Accepts `x-indexer-secret: $INDEXER_SECRET` or Vercel cron's `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorized(req: Request): boolean {
  const indexerSecret = getIndexerSecret();
  const cronSecret = getCronSecret();
  const headerSecret = req.headers.get("x-indexer-secret") ?? "";
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return safeEqual(headerSecret, indexerSecret) || safeEqual(bearer, cronSecret);
}

type RunBody = ApiOk<IndexerRunResult> & IndexerRunResult;

const run = handle(async (req: NextRequest) => {
  if (!isAuthorized(req)) return fail(401, "UNAUTHORIZED", "Missing or invalid indexer secret");
  const db = getServiceClient();
  const empty: IndexerRunResult = { processed: 0, fromBlock: 0, toBlock: 0, snapshots: 0 };
  if (!db) {
    const body: RunBody = { ok: true, data: empty, source: "unconfigured", ...empty };
    return NextResponse.json(body);
  }
  const result = await runIndexer({ db });
  const body: RunBody = { ok: true, data: result, source: "supabase", ...result };
  return NextResponse.json(body);
});

export const POST = run;
/** Vercel cron invokes with GET. */
export const GET = run;
