import { previewPosition, type PositionPreview, WAD } from "./math";
import type { MosaicAsset, PositionView } from "@/types/mosaic";

export type PositionAction = "add" | "borrow" | "repay" | "withdraw";

export interface ActionInput {
  action: PositionAction;
  amount: bigint;
  asset: MosaicAsset;
  position: PositionView;
  /** Pool free MUSD (borrow) */
  poolLiquidity?: bigint;
  /** Wallet balance of the collateral token (add) */
  tokenBalance?: bigint;
  /** Wallet balance of MUSD (repay) */
  musdBalance?: bigint;
  /** Engine paused flag */
  enginePaused?: boolean;
}

export interface ActionPlan {
  /** Position after the action, computed with MosaicMath. */
  next: PositionPreview;
  /** Position now, computed the same way so the before/after use one formula. */
  current: PositionPreview;
  /** Amount actually applied (repay is capped at the debt). */
  applied: bigint;
  /** Human reason the engine would reject this, or null when it should pass. */
  blocked: string | null;
}

export const ACTION_LABEL: Record<PositionAction, string> = {
  add: "Add collateral",
  borrow: "Borrow MUSD",
  repay: "Repay MUSD",
  withdraw: "Withdraw collateral",
};

/** Mirrors the engine's checks so the review step can say what will happen before any gas is spent. */
export function planAction(input: ActionInput): ActionPlan {
  const { action, amount, asset, position } = input;
  const cfg = asset.config;
  const base = {
    tokenDecimals: asset.decimals,
    price: asset.price.price,
    priceDecimals: asset.price.decimals,
    maxLtvBps: cfg.maxLtvBps,
    liqThresholdBps: cfg.liquidationThresholdBps,
  };
  const current = previewPosition({ ...base, collateral: position.collateral, debt: position.debt });

  let collateral = position.collateral;
  let debt = position.debt;
  let applied = amount;
  let blocked: string | null = null;

  const priceValid = asset.price.valid;
  const active = cfg.status === 1;

  switch (action) {
    case "add": {
      collateral += amount;
      if (input.enginePaused) blocked = "The engine is paused. Only repayments are allowed right now.";
      else if (!active) blocked = "This asset is paused. New deposits are blocked.";
      else if (input.tokenBalance !== undefined && amount > input.tokenBalance) blocked = "That is more than your wallet balance.";
      else if (collateral < cfg.minDeposit) blocked = "The resulting collateral would be below the minimum deposit for this asset.";
      else if (asset.totalCollateral + amount > cfg.maxExposure) blocked = "The protocol has reached the deposit cap for this asset.";
      break;
    }
    case "borrow": {
      debt += amount;
      if (input.enginePaused) blocked = "The engine is paused. Only repayments are allowed right now.";
      else if (!active) blocked = "This asset is paused. New borrows are blocked.";
      else if (!priceValid) blocked = "The oracle price is missing or stale, so borrowing is blocked.";
      else if (position.collateral === 0n) blocked = "Deposit collateral before borrowing.";
      else if (amount > position.availableToBorrow) blocked = "That is more than this position's borrowing limit.";
      else if (input.poolLiquidity !== undefined && amount > input.poolLiquidity) blocked = "The pool does not have enough MUSD to lend right now.";
      break;
    }
    case "repay": {
      if (position.debt === 0n) blocked = "This position has no debt to repay.";
      applied = amount < position.debt ? amount : position.debt;
      debt -= applied;
      if (!blocked && input.musdBalance !== undefined && applied > input.musdBalance) blocked = "That is more MUSD than your wallet holds.";
      break;
    }
    case "withdraw": {
      if (input.enginePaused) blocked = "The engine is paused. Withdrawals are blocked right now.";
      else if (amount > position.collateral) blocked = "The position does not hold that much collateral.";
      else {
        collateral -= amount;
        if (position.debt > 0n && !priceValid) blocked = "The oracle price is missing or stale, so withdrawals are blocked while the position has debt.";
        else if (collateral !== 0n && collateral < cfg.minDeposit) blocked = "Remaining collateral must be zero or at least the minimum deposit.";
      }
      break;
    }
  }

  const next = previewPosition({ ...base, collateral, debt });
  if (!blocked && (action === "borrow" || action === "withdraw") && debt > 0n) {
    if (!next.withinMaxLtv) blocked = action === "borrow" ? "This borrow would exceed the asset's maximum loan-to-value." : "Withdrawing this much would push the position over its maximum loan-to-value.";
    else if (next.healthFactor < WAD) blocked = "The position would be liquidatable after this.";
  }
  return { next, current, applied, blocked };
}
