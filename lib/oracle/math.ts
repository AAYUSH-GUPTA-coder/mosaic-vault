/**
 * Mirrors contracts/contracts/libraries/MosaicMath.sol exactly, in bigint.
 * All USD values are 18-dec fixed point; ratios are basis points; HF is WAD.
 * Never use JS floats for monetary state.
 */
export const WAD = 10n ** 18n;
export const BPS = 10_000n;
export const MAX_UINT256 = (1n << 256n) - 1n;

/** OpenZeppelin Math.mulDiv (floor). bigint has no overflow, so a plain expression is exact. */
export function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("mulDiv: division by zero");
  return (a * b) / denominator;
}

/** amount (tokenDecimals) * price (priceDecimals) -> USD 18 dec */
export function toUsd(
  amount: bigint,
  tokenDecimals: number,
  price: bigint,
  priceDecimals: number,
): bigint {
  return mulDiv(amount * WAD, price, 10n ** BigInt(tokenDecimals + priceDecimals));
}

/** USD 18 dec -> token units */
export function fromUsd(
  usd: bigint,
  tokenDecimals: number,
  price: bigint,
  priceDecimals: number,
): bigint {
  if (price === 0n) return 0n;
  return mulDiv(usd, 10n ** BigInt(tokenDecimals + priceDecimals), price * WAD);
}

export function maxDebt(collateralUsd: bigint, maxLtvBps: number): bigint {
  return (collateralUsd * BigInt(maxLtvBps)) / BPS;
}

/** WAD health factor; MAX_UINT256 when debt == 0 (matches type(uint256).max). */
export function healthFactor(
  collateralUsd: bigint,
  liqThresholdBps: number,
  debt: bigint,
): bigint {
  if (debt === 0n) return MAX_UINT256;
  return mulDiv(collateralUsd * BigInt(liqThresholdBps), WAD, debt * BPS);
}

/** 18-dec USD per whole token at which HF hits 1.0; 0 when no debt or no collateral. */
export function liquidationPrice(
  debt: bigint,
  collateral: bigint,
  tokenDecimals: number,
  liqThresholdBps: number,
): bigint {
  if (collateral === 0n || debt === 0n) return 0n;
  return mulDiv(debt * BPS, 10n ** BigInt(tokenDecimals), collateral * BigInt(liqThresholdBps));
}

export function ltvBps(debt: bigint, collateralUsd: bigint): bigint {
  if (collateralUsd === 0n) return 0n;
  return (debt * BPS) / collateralUsd;
}

/** Oracle price normalised to 18 decimals (what PositionView.price reports). */
export function normalizePrice18(price: bigint, priceDecimals: number): bigint {
  if (priceDecimals === 18) return price;
  if (priceDecimals < 18) return price * 10n ** BigInt(18 - priceDecimals);
  return price / 10n ** BigInt(priceDecimals - 18);
}

export interface PreviewInput {
  collateral: bigint;
  debt: bigint;
  tokenDecimals: number;
  price: bigint;
  priceDecimals: number;
  maxLtvBps: number;
  liqThresholdBps: number;
}

export interface PositionPreview {
  collateral: bigint;
  debt: bigint;
  collateralValueUsd: bigint;
  maxDebtUsd: bigint;
  healthFactor: bigint;
  liquidationPrice: bigint;
  currentLtvBps: bigint;
  /** debt <= maxDebtUsd (the engine's borrow/withdraw safety condition) */
  withinMaxLtv: boolean;
  /** HF >= 1.0 */
  safe: boolean;
}

/** Derived numbers for the review step, computed exactly as the engine would. */
export function previewPosition(input: PreviewInput): PositionPreview {
  const collateralValueUsd = toUsd(
    input.collateral,
    input.tokenDecimals,
    input.price,
    input.priceDecimals,
  );
  const maxDebtUsd = maxDebt(collateralValueUsd, input.maxLtvBps);
  const hf = healthFactor(collateralValueUsd, input.liqThresholdBps, input.debt);
  return {
    collateral: input.collateral,
    debt: input.debt,
    collateralValueUsd,
    maxDebtUsd,
    healthFactor: hf,
    liquidationPrice: liquidationPrice(
      input.debt,
      input.collateral,
      input.tokenDecimals,
      input.liqThresholdBps,
    ),
    currentLtvBps: ltvBps(input.debt, collateralValueUsd),
    withinMaxLtv: input.debt <= maxDebtUsd,
    safe: hf >= WAD,
  };
}

/** Largest collateral amount that can leave a position while HF >= 1 and debt <= maxDebt. */
export function maxWithdrawable(input: PreviewInput): bigint {
  if (input.debt === 0n) return input.collateral;
  if (input.price === 0n) return 0n;
  // collateral needed so that debt <= collateralUsd * maxLtv / BPS  (ceil)
  const neededUsd = ceilDiv(input.debt * BPS, BigInt(input.maxLtvBps));
  const neededCollateral = ceilDiv(
    neededUsd * 10n ** BigInt(input.tokenDecimals + input.priceDecimals),
    input.price * WAD,
  );
  if (neededCollateral >= input.collateral) return 0n;
  return input.collateral - neededCollateral;
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new RangeError("ceilDiv: division by zero");
  return (a + b - 1n) / b;
}

/** seizeUsd = debtToRepay * (BPS + penalty) / BPS; collateralToSeize = min(fromUsd(seizeUsd), collateral) */
export function liquidationQuote(
  repayAmount: bigint,
  debt: bigint,
  collateral: bigint,
  penaltyBps: number,
  tokenDecimals: number,
  price: bigint,
  priceDecimals: number,
): { debtToRepay: bigint; collateralToSeize: bigint } {
  const debtToRepay = repayAmount < debt ? repayAmount : debt;
  const seizeUsd = (debtToRepay * (BPS + BigInt(penaltyBps))) / BPS;
  const raw = fromUsd(seizeUsd, tokenDecimals, price, priceDecimals);
  return { debtToRepay, collateralToSeize: raw < collateral ? raw : collateral };
}
