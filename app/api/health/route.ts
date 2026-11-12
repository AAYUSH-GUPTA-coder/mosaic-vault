import { NextResponse } from "next/server";
import { getChainId, isSupabaseConfigured } from "@/lib/database/env";
import { makeViemClient } from "@/lib/database/indexer";
import type { HealthResponse } from "@/types/api";


export async function GET(): Promise<NextResponse<HealthResponse>> {
  const chainId = getChainId();
  let rpc: HealthResponse["rpc"] = "error";
  try {
    const client = makeViemClient();
    const id = await Promise.race([
      client.getChainId(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
    ]);
    rpc = id === chainId ? "ok" : "error";
  } catch {
    rpc = "error";
  }
  const body: HealthResponse = {
    ok: rpc === "ok",
    chainId,
    rpc,
    supabase: isSupabaseConfigured() ? "configured" : "unconfigured",
  };
  return NextResponse.json(body, { status: rpc === "ok" ? 200 : 503 });
}
