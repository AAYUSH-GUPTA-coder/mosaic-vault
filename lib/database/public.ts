import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/database/env";

/**
 * Anon-key Supabase client for READ-ONLY access to public index data
 * (collateral_assets, positions, indexed_events, asset_risk_snapshots — see policies/0001_rls.sql).
 * Safe to use in the browser. Returns `null` when Supabase is not configured.
 */

let cached: { key: string; client: SupabaseClient } | null = null;

export function getPublicClient(): SupabaseClient | null {
  const { url, anonKey, schema } = getSupabaseEnv();
  if (!url || !anonKey) return null;
  const key = `${url}|${anonKey}|${schema}`;
  if (cached && cached.key === key) return cached.client;
  const client = createClient(url, anonKey, {
    // Untyped client: the schema name is runtime config, so cast past the "public" literal default.
    db: { schema: schema as "public" },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  cached = { key, client };
  return client;
}
