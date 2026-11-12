/**
 * Environment access for the backend. Reads `process.env` lazily so tests can set values
 * before each case. Deliberately does NOT import `lib/blockchain/config.ts` (owned by the
 * web-app agent) to keep the backend decoupled.
 */

import type { Address } from "viem";

export const DEFAULT_CHAIN_ID = 31611;
export const DEFAULT_RPC_URL = "https://rpc.test.mezo.org";

function read(name: string): string {
  const v = process.env[name];
  return typeof v === "string" ? v.trim() : "";
}

function readAddress(name: string): Address | null {
  const v = read(name);
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? (v.toLowerCase() as Address) : null;
}

export function getChainId(): number {
  const n = Number.parseInt(read("NEXT_PUBLIC_CHAIN_ID"), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CHAIN_ID;
}

export function getRpcUrl(): string {
  return read("NEXT_PUBLIC_MEZO_RPC_URL") || DEFAULT_RPC_URL;
}

export function getAppUrl(): string {
  return read("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";
}

export interface ContractAddresses {
  musd: Address | null;
  btc: Address | null;
  btcUsdFeed: Address | null;
  oracle: Address | null;
  testOracle: Address | null;
  registry: Address | null;
  vault: Address | null;
  pool: Address | null;
  engine: Address | null;
  liquidationEngine: Address | null;
  testWbtc: Address | null;
  testUsd: Address | null;
}

export function getContractAddresses(): ContractAddresses {
  return {
    musd: readAddress("NEXT_PUBLIC_MUSD_ADDRESS"),
    btc: readAddress("NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS"),
    btcUsdFeed: readAddress("NEXT_PUBLIC_BTC_USD_FEED_ADDRESS"),
    oracle: readAddress("NEXT_PUBLIC_ORACLE_ADDRESS"),
    testOracle: readAddress("NEXT_PUBLIC_TEST_ORACLE_ADDRESS"),
    registry: readAddress("NEXT_PUBLIC_COLLATERAL_REGISTRY_ADDRESS"),
    vault: readAddress("NEXT_PUBLIC_COLLATERAL_VAULT_ADDRESS"),
    pool: readAddress("NEXT_PUBLIC_LENDING_POOL_ADDRESS"),
    engine: readAddress("NEXT_PUBLIC_LENDING_ENGINE_ADDRESS"),
    liquidationEngine: readAddress("NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS"),
    testWbtc: readAddress("NEXT_PUBLIC_TEST_WBTC_ADDRESS"),
    testUsd: readAddress("NEXT_PUBLIC_TEST_USD_ADDRESS"),
  };
}

export function getDeployBlock(): bigint {
  const v = read("NEXT_PUBLIC_DEPLOY_BLOCK");
  if (!/^\d+$/.test(v)) return BigInt(0);
  return BigInt(v);
}

export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Postgres schema holding the Mosaic tables (default "mosaic"; the project can be shared with other apps). */
  schema: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  return {
    url: read("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: read("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
    schema: read("SUPABASE_SCHEMA") || "mosaic",
  };
}

/** True when a Supabase URL is present (the app's "configured" switch per docs/API.md). */
export function isSupabaseConfigured(): boolean {
  return getSupabaseEnv().url.length > 0;
}

export function getSessionSecret(): string {
  return read("SESSION_SECRET");
}

export function getIndexerSecret(): string {
  return read("INDEXER_SECRET");
}

export function getCronSecret(): string {
  return read("CRON_SECRET");
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
