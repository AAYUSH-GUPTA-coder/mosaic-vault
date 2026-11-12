/**
 * Shared API types (docs/API.md). Used by route handlers and the frontend.
 * All on-chain integers are serialised as decimal strings; addresses are lowercase.
 */

export type ApiSource = "supabase" | "unconfigured" | "static";

export type ApiOk<T> = {
  ok: true;
  data: T;
  source?: ApiSource;
  /** Present on paginated endpoints (`/api/events`). `null` when there is no further page. */
  nextCursor?: string | null;
};

export type ApiErr = {
  ok: false;
  error: { code: string; message: string };
};

export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type AssetType = "verified_external" | "test_only" | "unsupported";
export type VerificationStatus = "verified" | "test_only" | "unverified";

export interface CollateralAssetRow {
  id: string;
  chain_id: number;
  token_address: string;
  symbol: string | null;
  name: string | null;
  decimals: number | null;
  asset_type: AssetType | null;
  oracle_address: string | null;
  verification_status: VerificationStatus | null;
  notes: string | null;
  created_at: string;
}

export interface PositionIndex {
  id: string;
  wallet_address: string;
  collateral_asset: string;
  /** `${engine}:${wallet}:${asset}` */
  contract_position_id: string;
  chain_id: number;
  contract_address: string;
  first_seen_block: number | null;
  last_event_block: number | null;
  created_at: string;
}

export interface IndexedEvent {
  id: number;
  chain_id: number;
  contract_address: string;
  transaction_hash: string;
  block_number: number;
  log_index: number;
  event_name: string;
  /** Decoded event args; bigints serialised as decimal strings. */
  event_payload: Record<string, unknown>;
  wallet_address: string | null;
  asset_address: string | null;
  block_timestamp: string | null;
  processed_at: string;
}

export interface RiskSnapshot {
  id: number;
  chain_id: number;
  asset_address: string;
  /** Raw oracle price in `price_decimals`. */
  price: string | null;
  price_decimals: number | null;
  price_updated_at: string | null;
  /** Token units (raw integer string). */
  total_collateral: string | null;
  /** 18-decimal USD (raw integer string). */
  collateral_value_usd: string | null;
  /** MUSD, 18 decimals (raw integer string). */
  outstanding_debt: string | null;
  /** MUSD, 18 decimals (raw integer string). */
  borrow_cap: string | null;
  /** outstanding_debt / borrow_cap as a 0..1 fraction (6 dp). */
  utilization: string | null;
  health_metrics: Record<string, unknown>;
  taken_at: string;
}

export interface AuditLog {
  id: number;
  actor: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/* ---- Auth payloads ---- */

export interface NonceResponse {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface SessionResponse {
  address: string;
}

export interface HealthResponse {
  ok: boolean;
  chainId: number;
  rpc: "ok" | "error";
  supabase: "configured" | "unconfigured";
}

export interface IndexerRunResult {
  processed: number;
  fromBlock: number;
  toBlock: number;
  snapshots: number;
}
