import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditLog, CollateralAssetRow, IndexedEvent, PositionIndex, RiskSnapshot } from "@/types/api";

/**
 * Typed query helpers over a Supabase client. Every helper takes the client explicitly so routes
 * pass the service-role client and tests pass a fake. Addresses are lowercased on write.
 */

function fail(where: string, error: { message: string } | null): never {
  throw new Error(`[db] ${where}: ${error?.message ?? "unknown error"}`);
}

const lower = (s: string) => s.toLowerCase();

/* ---- users ---- */

export async function upsertUser(db: SupabaseClient, walletAddress: string): Promise<void> {
  const { error } = await db
    .from("users")
    .upsert({ wallet_address: lower(walletAddress) }, { onConflict: "wallet_address", ignoreDuplicates: true });
  if (error) fail("upsertUser", error);
}

/* ---- auth_nonces ---- */

export interface NonceRow {
  nonce: string;
  wallet_address: string;
  expires_at: string;
  used_at: string | null;
}

export async function insertNonce(
  db: SupabaseClient,
  row: { nonce: string; wallet_address: string; expires_at: string },
): Promise<void> {
  const { error } = await db.from("auth_nonces").insert({ ...row, wallet_address: lower(row.wallet_address) });
  if (error) fail("insertNonce", error);
}

export async function getNonceRow(db: SupabaseClient, nonce: string): Promise<NonceRow | null> {
  const { data, error } = await db
    .from("auth_nonces")
    .select("nonce, wallet_address, expires_at, used_at")
    .eq("nonce", nonce)
    .maybeSingle();
  if (error) fail("getNonceRow", error);
  return (data as NonceRow | null) ?? null;
}

/** Marks a nonce used only if it is still unused; returns false when another request won. */
export async function markNonceUsed(db: SupabaseClient, nonce: string, usedAtIso: string): Promise<boolean> {
  const { data, error } = await db
    .from("auth_nonces")
    .update({ used_at: usedAtIso })
    .eq("nonce", nonce)
    .is("used_at", null)
    .select("nonce");
  if (error) fail("markNonceUsed", error);
  return Array.isArray(data) && data.length === 1;
}

/* ---- collateral_assets ---- */

export async function listCollateralAssets(db: SupabaseClient, chainId: number): Promise<CollateralAssetRow[]> {
  const { data, error } = await db
    .from("collateral_assets")
    .select("*")
    .eq("chain_id", chainId)
    .order("created_at", { ascending: true });
  if (error) fail("listCollateralAssets", error);
  return (data ?? []) as CollateralAssetRow[];
}

/* ---- positions ---- */

export async function listPositions(
  db: SupabaseClient,
  params: { chainId: number; wallet: string },
): Promise<PositionIndex[]> {
  const { data, error } = await db
    .from("positions")
    .select("*")
    .eq("chain_id", params.chainId)
    .eq("wallet_address", lower(params.wallet))
    .order("created_at", { ascending: true });
  if (error) fail("listPositions", error);
  return (data ?? []) as PositionIndex[];
}

export interface PositionUpsert {
  wallet_address: string;
  collateral_asset: string;
  contract_position_id: string;
  chain_id: number;
  contract_address: string;
  first_seen_block: number;
  last_event_block: number;
}

/** Idempotent: existing rows are left untouched (first_seen_block preserved). */
export async function upsertPositions(db: SupabaseClient, rows: PositionUpsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("positions").upsert(
    rows.map((r) => ({
      ...r,
      wallet_address: lower(r.wallet_address),
      collateral_asset: lower(r.collateral_asset),
      contract_address: lower(r.contract_address),
      contract_position_id: lower(r.contract_position_id),
    })),
    { onConflict: "chain_id,contract_address,wallet_address,collateral_asset", ignoreDuplicates: true },
  );
  if (error) fail("upsertPositions", error);
}

export async function touchPosition(
  db: SupabaseClient,
  key: { chain_id: number; contract_address: string; wallet_address: string; collateral_asset: string },
  lastEventBlock: number,
): Promise<void> {
  const { error } = await db
    .from("positions")
    .update({ last_event_block: lastEventBlock })
    .eq("chain_id", key.chain_id)
    .eq("contract_address", lower(key.contract_address))
    .eq("wallet_address", lower(key.wallet_address))
    .eq("collateral_asset", lower(key.collateral_asset))
    .lt("last_event_block", lastEventBlock);
  if (error) fail("touchPosition", error);
}

/* ---- indexed_events ---- */

export type IndexedEventInsert = Omit<IndexedEvent, "id" | "processed_at">;

/** Idempotent on (chain_id, transaction_hash, log_index). */
export async function upsertIndexedEvents(db: SupabaseClient, rows: IndexedEventInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("indexed_events").upsert(
    rows.map((r) => ({
      ...r,
      contract_address: lower(r.contract_address),
      transaction_hash: lower(r.transaction_hash),
      wallet_address: r.wallet_address ? lower(r.wallet_address) : null,
      asset_address: r.asset_address ? lower(r.asset_address) : null,
    })),
    { onConflict: "chain_id,transaction_hash,log_index", ignoreDuplicates: true },
  );
  if (error) fail("upsertIndexedEvents", error);
}

export interface ListEventsParams {
  chainId: number;
  wallet?: string;
  asset?: string;
  limit: number;
  /** Opaque cursor = id of the last row of the previous page. */
  cursor?: string;
}

export async function listEvents(
  db: SupabaseClient,
  p: ListEventsParams,
): Promise<{ rows: IndexedEvent[]; nextCursor: string | null }> {
  let q = db.from("indexed_events").select("*").eq("chain_id", p.chainId);
  if (p.wallet) q = q.eq("wallet_address", lower(p.wallet));
  if (p.asset) q = q.eq("asset_address", lower(p.asset));
  if (p.cursor) q = q.lt("id", Number(p.cursor));
  q = q.order("id", { ascending: false }).limit(p.limit + 1);
  const { data, error } = await q;
  if (error) fail("listEvents", error);
  const all = (data ?? []) as IndexedEvent[];
  const rows = all.slice(0, p.limit);
  const nextCursor = all.length > p.limit && rows.length > 0 ? String(rows[rows.length - 1].id) : null;
  return { rows, nextCursor };
}

/* ---- indexer_cursors ---- */

export async function getCursor(db: SupabaseClient, key: string): Promise<bigint | null> {
  const { data, error } = await db.from("indexer_cursors").select("last_block").eq("key", key).maybeSingle();
  if (error) fail("getCursor", error);
  const v = (data as { last_block: number | string } | null)?.last_block;
  return v === undefined || v === null ? null : BigInt(v);
}

export async function setCursor(
  db: SupabaseClient,
  row: { key: string; chain_id: number; contract_address: string | null; last_block: bigint },
): Promise<void> {
  const { error } = await db.from("indexer_cursors").upsert(
    {
      key: row.key,
      chain_id: row.chain_id,
      contract_address: row.contract_address ? lower(row.contract_address) : null,
      last_block: Number(row.last_block),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) fail("setCursor", error);
}

/* ---- asset_risk_snapshots ---- */

export type RiskSnapshotInsert = Omit<RiskSnapshot, "id" | "taken_at">;

export async function insertSnapshots(db: SupabaseClient, rows: RiskSnapshotInsert[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("asset_risk_snapshots")
    .insert(rows.map((r) => ({ ...r, asset_address: lower(r.asset_address) })));
  if (error) fail("insertSnapshots", error);
}

export async function listSnapshots(
  db: SupabaseClient,
  p: { chainId: number; asset: string; limit: number },
): Promise<RiskSnapshot[]> {
  const { data, error } = await db
    .from("asset_risk_snapshots")
    .select("*")
    .eq("chain_id", p.chainId)
    .eq("asset_address", lower(p.asset))
    .order("taken_at", { ascending: true })
    .limit(p.limit);
  if (error) fail("listSnapshots", error);
  return (data ?? []) as RiskSnapshot[];
}

/* ---- audit_logs ---- */

export async function insertAuditLog(
  db: SupabaseClient,
  row: { actor: string; action: string; target: string | null; metadata: Record<string, unknown> },
): Promise<AuditLog> {
  const { data, error } = await db
    .from("audit_logs")
    .insert({ ...row, actor: lower(row.actor) })
    .select("*")
    .single();
  if (error) fail("insertAuditLog", error);
  return data as AuditLog;
}

export async function listAuditLogs(db: SupabaseClient, limit: number): Promise<AuditLog[]> {
  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail("listAuditLogs", error);
  return (data ?? []) as AuditLog[];
}
