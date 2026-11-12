import { erc20Abi, type Address, type PublicClient } from "viem";
import { contracts } from "./contracts";
import { ASSET_METADATA, findAssetMeta, mosaicConfig } from "./config";
import { oracleAdapterAbi, testCollateralTokenAbi } from "./abis";
import { ROLES } from "./roles";
import { normalizePrice18 } from "@/lib/oracle/math";
import type {
  AssetKindLabel,
  CollateralConfig,
  MosaicAsset,
  PoolState,
  PositionView,
  PriceData,
} from "@/types/mosaic";

/** Pure viem read helpers. Each takes a PublicClient so they work in hooks, tests and scripts. */

export async function readAssetList(client: PublicClient): Promise<Address[]> {
  return [...(await client.readContract({ ...contracts.registry, functionName: "listAssets" }))];
}

export async function readCollateralConfig(client: PublicClient, token: Address): Promise<CollateralConfig> {
  const c = await client.readContract({ ...contracts.registry, functionName: "getCollateralConfig", args: [token] });
  return {
    token: c.token,
    oracle: c.oracle,
    decimals: c.decimals,
    maxLtvBps: c.maxLtvBps,
    liquidationThresholdBps: c.liquidationThresholdBps,
    liquidationPenaltyBps: c.liquidationPenaltyBps,
    borrowCap: c.borrowCap,
    maxExposure: c.maxExposure,
    minDeposit: c.minDeposit,
    status: c.status as CollateralConfig["status"],
    kind: c.kind as CollateralConfig["kind"],
    lastUpdated: c.lastUpdated,
  };
}

export async function readPriceData(client: PublicClient, oracle: Address, asset: Address): Promise<PriceData> {
  try {
    const d = await client.readContract({ address: oracle, abi: oracleAdapterAbi, functionName: "getPriceData", args: [asset] });
    return { price: d.price, decimals: d.decimals, updatedAt: d.updatedAt, valid: d.valid };
  } catch {
    return { price: 0n, decimals: 18, updatedAt: 0n, valid: false };
  }
}

export async function readTokenMeta(client: PublicClient, token: Address): Promise<{ symbol: string; name: string; decimals: number }> {
  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address: token, abi: erc20Abi, functionName: "symbol" }).catch(() => "TOKEN"),
    client.readContract({ address: token, abi: erc20Abi, functionName: "name" }).catch(() => "Unknown token"),
    client.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }).catch(() => 18),
  ]);
  return { symbol, name, decimals: Number(decimals) };
}

/** Registry list + config + oracle price + exposure, merged with static metadata by address. */
export async function readMosaicAssets(client: PublicClient): Promise<MosaicAsset[]> {
  const tokens = await readAssetList(client);
  return Promise.all(tokens.map((t) => readMosaicAsset(client, t)));
}

export async function readMosaicAsset(client: PublicClient, token: Address): Promise<MosaicAsset> {
  const config = await readCollateralConfig(client, token);
  const meta = findAssetMeta(token);
  const [price, totalCollateral, assetDebt, chainMeta] = await Promise.all([
    readPriceData(client, config.oracle, token),
    client.readContract({ ...contracts.vault, functionName: "getTotalCollateral", args: [token] }),
    client.readContract({ ...contracts.pool, functionName: "getOutstandingDebt", args: [token] }),
    meta ? Promise.resolve(null) : readTokenMeta(client, token),
  ]);
  const kind: AssetKindLabel = config.kind === 1 ? "test_only" : "verified_external";
  const isNative = meta?.isNative ?? token.toLowerCase() === mosaicConfig.addresses.btc.toLowerCase();
  const hasFaucet = meta?.hasFaucet ?? (kind === "test_only" && (await hasFaucetFn(client, token)));
  return {
    address: token,
    symbol: meta?.symbol ?? chainMeta?.symbol ?? "TOKEN",
    name: meta?.name ?? chainMeta?.name ?? "Unknown token",
    decimals: config.decimals || meta?.decimals || chainMeta?.decimals || 18,
    kind,
    isNative,
    hasFaucet,
    config,
    price,
    priceUsd18: price.valid ? normalizePrice18(price.price, price.decimals) : 0n,
    totalCollateral,
    assetDebt,
  };
}

async function hasFaucetFn(client: PublicClient, token: Address): Promise<boolean> {
  try {
    await client.readContract({ address: token, abi: testCollateralTokenAbi, functionName: "maxFaucetPerCall" });
    return true;
  } catch {
    return false;
  }
}

export async function readPositionView(client: PublicClient, user: Address, asset: Address): Promise<PositionView> {
  const v = await client.readContract({ ...contracts.engine, functionName: "getPositionView", args: [user, asset] });
  return {
    collateral: v.collateral,
    debt: v.debt,
    collateralValueUsd: v.collateralValueUsd,
    maxDebtUsd: v.maxDebtUsd,
    availableToBorrow: v.availableToBorrow,
    healthFactor: v.healthFactor,
    liquidationPrice: v.liquidationPrice,
    currentLtvBps: v.currentLtvBps,
    price: v.price,
    priceUpdatedAt: v.priceUpdatedAt,
    priceValid: v.priceValid,
  };
}

export async function readPool(client: PublicClient): Promise<PoolState & { paused: boolean }> {
  const [availableLiquidity, totalOutstandingDebt, totalPoolAssets, totalBadDebt, musd, paused] = await Promise.all([
    client.readContract({ ...contracts.pool, functionName: "getAvailableLiquidity" }),
    client.readContract({ ...contracts.pool, functionName: "getTotalOutstandingDebt" }),
    client.readContract({ ...contracts.pool, functionName: "getTotalPoolAssets" }),
    client.readContract({ ...contracts.pool, functionName: "totalBadDebt" }),
    client.readContract({ ...contracts.pool, functionName: "musd" }),
    client.readContract({ ...contracts.engine, functionName: "paused" }).catch(() => false),
  ]);
  return { availableLiquidity, totalOutstandingDebt, totalPoolAssets, totalBadDebt, musd, paused };
}

export async function readTokenBalance(client: PublicClient, token: Address, owner: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export async function readAllowance(client: PublicClient, token: Address, owner: Address, spender: Address): Promise<bigint> {
  return client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });
}

export async function readHasRole(client: PublicClient, contract: Address, role: keyof typeof ROLES, account: Address): Promise<boolean> {
  try {
    return await client.readContract({ address: contract, abi: contracts.registry.abi, functionName: "hasRole", args: [ROLES[role], account] });
  } catch {
    return false;
  }
}

export async function readIsLiquidatable(client: PublicClient, user: Address, asset: Address): Promise<boolean> {
  try {
    return await client.readContract({ ...contracts.liquidationEngine, functionName: "isLiquidatable", args: [user, asset] });
  } catch {
    return false;
  }
}

export async function readLiquidationQuote(client: PublicClient, user: Address, asset: Address, repayAmount: bigint) {
  const [debtToRepay, collateralToSeize, price, liquidatable] = await client.readContract({
    ...contracts.liquidationEngine,
    functionName: "getLiquidationQuote",
    args: [user, asset, repayAmount],
  });
  return { debtToRepay, collateralToSeize, price, liquidatable };
}

export async function readFaucetCap(client: PublicClient, token: Address): Promise<bigint | null> {
  try {
    return await client.readContract({ address: token, abi: testCollateralTokenAbi, functionName: "maxFaucetPerCall" });
  } catch {
    return null;
  }
}

/** Static list of known assets, for labels before the registry is reachable. */
export const KNOWN_ASSETS = ASSET_METADATA;
