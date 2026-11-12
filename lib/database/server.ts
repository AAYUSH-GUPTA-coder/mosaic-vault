import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/database/env";

/**
 * Service-role Supabase client. Server routes ONLY — this bypasses RLS.
 * Returns `null` when Supabase is not configured so every route can degrade gracefully.
 */

let cached: { key: string; client: SupabaseClient } | null = null;

export function getServiceClient(): SupabaseClient | null {
  const { url, serviceRoleKey, schema } = getSupabaseEnv();
  if (!url || !serviceRoleKey) return null;
  const key = `${url}|${serviceRoleKey}|${schema}`;
  if (cached && cached.key === key) return cached.client;
  const client = createClient(url, serviceRoleKey, {
    // Untyped client: the schema name is runtime config, so cast past the "public" literal default.
    db: { schema: schema as "public" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "x-mosaic-vault": "server" } },
  });
  cached = { key, client };
  return client;
}

export type { SupabaseClient };
