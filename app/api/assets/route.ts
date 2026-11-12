import { connection } from "next/server";
import { handle, ok } from "@/app/api/_lib/http";
import { getChainId, getContractAddresses } from "@/lib/database/env";
import { listCollateralAssets } from "@/lib/database/queries";
import { getServiceClient } from "@/lib/database/server";
import type { CollateralAssetRow } from "@/types/api";


/**
 * Static fallback when Supabase is unconfigured, derived from NEXT_PUBLIC_* env
 * (same data as lib/blockchain/config.ts; kept env-based to avoid a cross-module import).
 */
function staticAssets(chainId: number): CollateralAssetRow[] {
  const a = getContractAddresses();
  const now = new Date(0).toISOString();
  const rows: CollateralAssetRow[] = [];
  if (a.btc) {
    rows.push({
      id: "static-btc", chain_id: chainId, token_address: a.btc, symbol: "BTC", name: "BTC (Mezo precompile)", decimals: 18,
      asset_type: "verified_external", oracle_address: a.oracle, verification_status: "verified",
      notes: "Real Mezo testnet BTC priced by the BTC/USD oracle precompile via ChainlinkFeedOracleAdapter.", created_at: now,
    });
  }
  if (a.testWbtc) {
    rows.push({
      id: "static-twbtc", chain_id: chainId, token_address: a.testWbtc, symbol: "tWBTC", name: "Mosaic Test Wrapped BTC (test-only)", decimals: 8,
      asset_type: "test_only", oracle_address: a.testOracle, verification_status: "test_only",
      notes: "TEST-ONLY TOKEN: no value, minted by the team. Admin-set price.", created_at: now,
    });
  }
  if (a.testUsd) {
    rows.push({
      id: "static-tusd", chain_id: chainId, token_address: a.testUsd, symbol: "tUSD", name: "Mosaic Test Stablecoin (test-only)", decimals: 6,
      asset_type: "test_only", oracle_address: a.testOracle, verification_status: "test_only",
      notes: "TEST-ONLY TOKEN: no value, minted by the team. Admin-set price of 1.00.", created_at: now,
    });
  }
  rows.push({
    id: "static-rwa", chain_id: chainId, token_address: "0x00000000000000000000000000000000000000ff", symbol: "RWA",
    name: "Tokenized RWA (not enabled)", decimals: null, asset_type: "unsupported", oracle_address: null,
    verification_status: "unverified", notes: "Not enabled. Requires oracle, custody and legal review.", created_at: now,
  });
  return rows;
}

export const GET = handle(async () => {
  await connection();
  const chainId = getChainId();
  const db = getServiceClient();
  if (!db) return ok(staticAssets(chainId), "static");
  const rows = await listCollateralAssets(db, chainId);
  return ok(rows, "supabase");
});
