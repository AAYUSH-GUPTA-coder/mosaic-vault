import type { Address, Hash } from "viem";

/** Mirrors IMosaicTypes.AssetStatus */
export const AssetStatus = { None: 0, Active: 1, Paused: 2 } as const;
export type AssetStatusValue = (typeof AssetStatus)[keyof typeof AssetStatus];

/** Mirrors IMosaicTypes.AssetKind */
export const AssetKind = { VerifiedExternal: 0, TestOnly: 1 } as const;
export type AssetKindValue = (typeof AssetKind)[keyof typeof AssetKind];

export type AssetKindLabel = "verified_external" | "test_only" | "unsupported";

/** Static, UI-only metadata that is merged onto on-chain registry data by address. */
export interface AssetMeta {
  symbol: string;
  name: string;
  decimals: number;
  kind: AssetKindLabel;
  /** Token address (lowercase for comparisons); empty string when not deployed. */
  address: string;
  /** Oracle feed/precompile address when known statically. */
  feed?: string;
  /** Native-gas token mirror (BTC precompile). */
  isNative?: boolean;
  /** TestCollateralToken with a public faucet. */
  hasFaucet?: boolean;
  /** Chain truth may override; this is the fallback description. */
  description: string;
}

/** CollateralRegistry.CollateralConfig */
export interface CollateralConfig {
  token: Address;
  oracle: Address;
  decimals: number;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationPenaltyBps: number;
  borrowCap: bigint;
  maxExposure: bigint;
  minDeposit: bigint;
  status: AssetStatusValue;
  kind: AssetKindValue;
  lastUpdated: bigint;
}

/** IPriceOracleAdapter.PriceData */
export interface PriceData {
  price: bigint;
  decimals: number;
  updatedAt: bigint;
  valid: boolean;
}

/** A registered collateral asset with merged metadata and live reads. */
export interface MosaicAsset {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: AssetKindLabel;
  isNative: boolean;
  hasFaucet: boolean;
  config: CollateralConfig;
  price: PriceData;
  /** Oracle-normalised 18-dec USD price (0 when invalid). */
  priceUsd18: bigint;
  totalCollateral: bigint;
  assetDebt: bigint;
}

/** MosaicLendingEngine.PositionView */
export interface PositionView {
  collateral: bigint;
  debt: bigint;
  collateralValueUsd: bigint;
  maxDebtUsd: bigint;
  availableToBorrow: bigint;
  healthFactor: bigint;
  liquidationPrice: bigint;
  currentLtvBps: bigint;
  price: bigint;
  priceUpdatedAt: bigint;
  priceValid: boolean;
}

export interface PoolState {
  availableLiquidity: bigint;
  totalOutstandingDebt: bigint;
  totalPoolAssets: bigint;
  totalBadDebt: bigint;
  musd: Address;
}

export type TxHistoryKind =
  | "PositionOpened"
  | "CollateralAdded"
  | "CollateralWithdrawn"
  | "Borrowed"
  | "Repaid"
  | "PositionLiquidated"
  | "Liquidation"
  | "LiquidityDeposited"
  | "LiquidityWithdrawn"
  | "Other";

/** Common shape for history rows from the API index or RPC getLogs. */
export interface TxHistoryItem {
  id: string;
  kind: TxHistoryKind;
  txHash: Hash;
  blockNumber: bigint;
  logIndex: number;
  timestamp: number | null;
  wallet: Address | null;
  asset: Address | null;
  /** Primary amount in the event (token units for collateral events, MUSD for debt events). */
  amount: bigint | null;
  /** Secondary value (newCollateral / newDebt / collateralSeized). */
  secondary: bigint | null;
  source: "api" | "rpc";
}

export type HealthBand = "none" | "healthy" | "watch" | "risk" | "liquidatable";

export type TxFlowStatus =
  | "idle"
  | "review"
  | "approving"
  | "submitting"
  | "pending"
  | "confirmed"
  | "reverted";
