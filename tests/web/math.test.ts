import { describe, expect, it } from "vitest";
import {
  BPS,
  MAX_UINT256,
  WAD,
  fromUsd,
  healthFactor,
  liquidationPrice,
  liquidationQuote,
  ltvBps,
  maxDebt,
  maxWithdrawable,
  mulDiv,
  normalizePrice18,
  previewPosition,
  toUsd,
} from "@/lib/oracle/math";

const E18 = 10n ** 18n;
const BTC_PRICE_18 = 75_591_620_000_000_000_000_000n; // 75,591.62 USD, 18 dec (precompile)
const WBTC_PRICE_8 = 75_591_62000000n; // same price, 8 dec (TestPriceOracle)

describe("MosaicMath mirror", () => {
  it("mulDiv floors like OpenZeppelin", () => {
    expect(mulDiv(7n, 3n, 2n)).toBe(10n);
    expect(() => mulDiv(1n, 1n, 0n)).toThrow();
  });

  it("toUsd: 1 BTC (18 dec) at 18-dec price == price", () => {
    expect(toUsd(E18, 18, BTC_PRICE_18, 18)).toBe(BTC_PRICE_18);
  });

  it("toUsd: 0.5 tWBTC (8 dec) at 8-dec price normalises to 18-dec USD", () => {
    const half = 50_000_000n;
    expect(toUsd(half, 8, WBTC_PRICE_8, 8)).toBe(BTC_PRICE_18 / 2n);
  });

  it("toUsd: 1,000 tUSD (6 dec) at $1.00 (8 dec) == 1000e18", () => {
    expect(toUsd(1_000_000_000n, 6, 100_000_000n, 8)).toBe(1_000n * E18);
  });

  it("fromUsd inverts toUsd for whole tokens", () => {
    const usd = toUsd(E18, 18, BTC_PRICE_18, 18);
    expect(fromUsd(usd, 18, BTC_PRICE_18, 18)).toBe(E18);
    const usd8 = toUsd(100_000_000n, 8, WBTC_PRICE_8, 8);
    expect(fromUsd(usd8, 8, WBTC_PRICE_8, 8)).toBe(100_000_000n);
    expect(fromUsd(1n, 8, 0n, 8)).toBe(0n);
  });

  it("maxDebt uses bps", () => {
    expect(maxDebt(1_000n * E18, 6_000)).toBe(600n * E18);
    expect(BPS).toBe(10_000n);
  });

  it("healthFactor: max when no debt; exact WAD otherwise", () => {
    expect(healthFactor(1_000n * E18, 7_000, 0n)).toBe(MAX_UINT256);
    // 1000 USD collateral, 70% threshold, 500 debt => 1.4
    expect(healthFactor(1_000n * E18, 7_000, 500n * E18)).toBe((14n * WAD) / 10n);
    // exactly 1.0 at threshold
    expect(healthFactor(1_000n * E18, 7_000, 700n * E18)).toBe(WAD);
  });

  it("liquidationPrice: debt*BPS*10^dec / (collateral*liq)", () => {
    // 1 BTC, 35,000 debt, 70% => 50,000 USD
    expect(liquidationPrice(35_000n * E18, E18, 18, 7_000)).toBe(50_000n * E18);
    // 0.5 tWBTC (8 dec), 17,500 debt, 70% => 50,000
    expect(liquidationPrice(17_500n * E18, 50_000_000n, 8, 7_000)).toBe(50_000n * E18);
    expect(liquidationPrice(0n, E18, 18, 7_000)).toBe(0n);
    expect(liquidationPrice(1n, 0n, 18, 7_000)).toBe(0n);
  });

  it("ltvBps", () => {
    expect(ltvBps(500n * E18, 1_000n * E18)).toBe(5_000n);
    expect(ltvBps(1n, 0n)).toBe(0n);
  });

  it("normalizePrice18", () => {
    expect(normalizePrice18(WBTC_PRICE_8, 8)).toBe(BTC_PRICE_18);
    expect(normalizePrice18(BTC_PRICE_18, 18)).toBe(BTC_PRICE_18);
    expect(normalizePrice18(100n * E18, 20)).toBe(E18);
  });

  it("previewPosition matches the engine's PositionView fields", () => {
    const p = previewPosition({ collateral: E18, debt: 30_000n * E18, tokenDecimals: 18, price: BTC_PRICE_18, priceDecimals: 18, maxLtvBps: 6_000, liqThresholdBps: 7_000 });
    expect(p.collateralValueUsd).toBe(BTC_PRICE_18);
    expect(p.maxDebtUsd).toBe((BTC_PRICE_18 * 6_000n) / 10_000n);
    expect(p.withinMaxLtv).toBe(true);
    expect(p.safe).toBe(true);
    expect(p.currentLtvBps).toBe((30_000n * E18 * 10_000n) / BTC_PRICE_18);
    const over = previewPosition({ collateral: E18, debt: 60_000n * E18, tokenDecimals: 18, price: BTC_PRICE_18, priceDecimals: 18, maxLtvBps: 6_000, liqThresholdBps: 7_000 });
    expect(over.withinMaxLtv).toBe(false);
    expect(over.safe).toBe(false);
  });

  it("maxWithdrawable keeps debt <= maxDebt of the remainder", () => {
    const input = { collateral: E18, debt: 30_000n * E18, tokenDecimals: 18, price: 100_000n * E18, priceDecimals: 18, maxLtvBps: 6_000, liqThresholdBps: 7_000 };
    const w = maxWithdrawable(input);
    // need 50,000 USD = 0.5 BTC remaining => can withdraw 0.5 BTC
    expect(w).toBe(E18 / 2n);
    const after = previewPosition({ ...input, collateral: input.collateral - w });
    expect(after.withinMaxLtv).toBe(true);
    expect(maxWithdrawable({ ...input, debt: 0n })).toBe(E18);
    expect(maxWithdrawable({ ...input, debt: 60_000n * E18 })).toBe(0n);
  });

  it("liquidationQuote applies the penalty and caps at collateral", () => {
    const q = liquidationQuote(10_000n * E18, 30_000n * E18, E18, 800, 18, 100_000n * E18, 18);
    expect(q.debtToRepay).toBe(10_000n * E18);
    // 10,800 USD / 100,000 => 0.108 BTC
    expect(q.collateralToSeize).toBe((108n * E18) / 1_000n);
    const capped = liquidationQuote(50_000n * E18, 30_000n * E18, 1_000n, 800, 18, 100_000n * E18, 18);
    expect(capped.debtToRepay).toBe(30_000n * E18);
    expect(capped.collateralToSeize).toBe(1_000n);
  });
});
