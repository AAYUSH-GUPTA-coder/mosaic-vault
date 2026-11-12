import { isAddress, type Address } from "viem";
import type { AssetMeta } from "@/types/mosaic";

/** Verified Mezo testnet facts (docs/ARCHITECTURE.md). */
export const BTC_PRECOMPILE = "0x7b7C000000000000000000000000000000000000" as const;
export const BTC_USD_FEED = "0x7b7c000000000000000000000000000000000015" as const;
export const MUSD_DEFAULT = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;

/**
 * Typed view over NEXT_PUBLIC_* envs. Addresses are "" until deployment.
 * NOTE: Next.js inlines `process.env.NEXT_PUBLIC_X` only when referenced literally,
 * so every variable is listed explicitly below.
 */
export const mosaicConfig = {
  chainId: 31611 as const,
  rpcUrl: process.env.NEXT_PUBLIC_MEZO_RPC_URL?.trim() || "https://rpc.test.mezo.org",
  explorerUrl:
    process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() || "https://explorer.test.mezo.org",
  explorerApiUrl:
    process.env.NEXT_PUBLIC_EXPLORER_API_URL?.trim() ||
    "https://api.explorer.test.mezo.org/api/v2",
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000",
  deployBlock: (() => {
    const raw = process.env.NEXT_PUBLIC_DEPLOY_BLOCK?.trim() || "";
    return /^\d+$/.test(raw) ? BigInt(raw) : 0n;
  })(),
  addresses: {
    musd: (addrOf(process.env.NEXT_PUBLIC_MUSD_ADDRESS) || MUSD_DEFAULT) as Address,
    btc: (addrOf(process.env.NEXT_PUBLIC_COLLATERAL_TOKEN_ADDRESS) || BTC_PRECOMPILE) as Address,
    btcUsdFeed: (addrOf(process.env.NEXT_PUBLIC_BTC_USD_FEED_ADDRESS) || BTC_USD_FEED) as Address,
    oracle: addrOf(process.env.NEXT_PUBLIC_ORACLE_ADDRESS),
    testOracle: addrOf(process.env.NEXT_PUBLIC_TEST_ORACLE_ADDRESS),
    registry: addrOf(process.env.NEXT_PUBLIC_COLLATERAL_REGISTRY_ADDRESS),
    vault: addrOf(process.env.NEXT_PUBLIC_COLLATERAL_VAULT_ADDRESS),
    pool: addrOf(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS),
    engine: addrOf(process.env.NEXT_PUBLIC_LENDING_ENGINE_ADDRESS),
    liquidationEngine: addrOf(process.env.NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS),
    testWbtc: addrOf(process.env.NEXT_PUBLIC_TEST_WBTC_ADDRESS),
    testUsd: addrOf(process.env.NEXT_PUBLIC_TEST_USD_ADDRESS),
  },
} as const;

function addrOf(raw: string | undefined): Address | "" {
  const v = raw?.trim() ?? "";
  return v && isAddress(v) ? (v as Address) : "";
}

export type MosaicAddresses = typeof mosaicConfig.addresses;
export type CoreContractKey = "registry" | "vault" | "pool" | "engine" | "liquidationEngine";

/** True once every contract a user flow needs has an address. */
export function isDeployed(): boolean {
  const a = mosaicConfig.addresses;
  return Boolean(a.registry && a.vault && a.pool && a.engine && a.liquidationEngine);
}

/** Which core contracts are still missing from env (for the "not deployed" banner). */
export function missingContracts(): CoreContractKey[] {
  const a = mosaicConfig.addresses;
  const keys: CoreContractKey[] = ["registry", "vault", "pool", "engine", "liquidationEngine"];
  return keys.filter((k) => !a[k]);
}

/** Static asset metadata; chain registry remains the source of truth. */
export const ASSET_METADATA: AssetMeta[] = [
  {
    symbol: "BTC",
    name: "Bitcoin (Mezo)",
    decimals: 18,
    kind: "verified_external",
    address: mosaicConfig.addresses.btc.toLowerCase(),
    feed: mosaicConfig.addresses.btcUsdFeed.toLowerCase(),
    isNative: true,
    description:
      "Mezo's native BTC through its ERC-20 precompile. Priced by the Chainlink-style BTC/USD precompile.",
  },
  {
    symbol: "tWBTC",
    name: "Mosaic Test Wrapped BTC (test-only)",
    decimals: 8,
    kind: "test_only",
    address: mosaicConfig.addresses.testWbtc.toLowerCase(),
    hasFaucet: true,
    description:
      "Test-only token minted by the team. Its price is set by an admin, not by a market.",
  },
  {
    symbol: "tUSD",
    name: "Mosaic Test Stablecoin (test-only)",
    decimals: 6,
    kind: "test_only",
    address: mosaicConfig.addresses.testUsd.toLowerCase(),
    hasFaucet: true,
    description:
      "Test-only stablecoin minted by the team. Its price is set by an admin, not by a market.",
  },
];

/** Shown in the Collateral table as not supported. Never registered on-chain. */
export const UNSUPPORTED_ASSETS: AssetMeta[] = [
  {
    symbol: "RWA",
    name: "Tokenized real-world assets",
    decimals: 18,
    kind: "unsupported",
    address: "",
    description: "Not enabled. Needs an oracle, custody and legal review before listing.",
  },
];

export const MUSD_META = {
  symbol: "MUSD",
  name: "Mezo USD",
  decimals: 18,
} as const;

export function findAssetMeta(address: string): AssetMeta | undefined {
  const a = address.toLowerCase();
  return ASSET_METADATA.find((m) => m.address && m.address === a);
}

export const DISCLAIMER = "Testnet MVP. Not audited. Not production lending infrastructure.";
export const ZERO_INTEREST_NOTE = "0% interest in this testnet MVP";
