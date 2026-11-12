import { describe, expect, it } from "vitest";
import {
  DASH,
  explorer,
  formatBigint,
  formatBps,
  formatHealthFactor,
  formatPrice18,
  formatRatioPct,
  formatTokenAmount,
  formatUsd18,
  healthBand,
  shortAddress,
  shortHash,
} from "@/lib/blockchain/formatters";
import { MAX_UINT256, WAD } from "@/lib/oracle/math";

const E18 = 10n ** 18n;

describe("formatters (bigint only)", () => {
  it("formatBigint groups thousands, truncates, trims zeros", () => {
    expect(formatBigint(1_234_567n * E18, 18)).toBe("1,234,567");
    expect(formatBigint(1_500_000_000_000_000_000n, 18)).toBe("1.5");
    expect(formatBigint(123_456_789n, 8, { maxFraction: 4 })).toBe("1.2345");
    expect(formatBigint(null, 18)).toBe(DASH);
    expect(formatBigint(undefined, 18)).toBe(DASH);
    expect(formatBigint(0n, 18)).toBe("0");
  });

  it("never shows -0 or scientific notation; tiny values get a marker", () => {
    expect(formatBigint(1n, 18, { maxFraction: 6 })).toBe("<0.000001");
    expect(formatUsd18(1n)).toBe("<$0.01");
    expect(formatUsd18(-5n * E18)).toBe("-$5.00");
    expect(formatUsd18(0n)).toBe("$0.00");
    expect(formatUsd18(10n ** 30n)).not.toMatch(/e\+/);
  });

  it("formatUsd18 shows 2 decimals with grouping", () => {
    expect(formatUsd18(75_591_620_000_000_000_000_000n)).toBe("$75,591.62");
    expect(formatUsd18(1_234_5n * 10n ** 14n)).toBe("$1.23");
    expect(formatUsd18(null)).toBe(DASH);
  });

  it("formatTokenAmount picks decimals by magnitude", () => {
    expect(formatTokenAmount(50_000_000n, 8)).toBe("0.5");
    expect(formatTokenAmount(123_456_789_012n, 8, { compact: true })).toBe("1,234.56");
    expect(formatTokenAmount(12_345_678n, 8, { compact: true })).toBe("0.123456");
    expect(formatTokenAmount(1n, 8)).toBe("0.00000001");
  });

  it("formatBps", () => {
    expect(formatBps(6_000)).toBe("60.00%");
    expect(formatBps(6_000, 0)).toBe("60%");
    expect(formatBps(1_234n)).toBe("12.34%");
    expect(formatBps(null)).toBe(DASH);
  });

  it("formatHealthFactor and bands", () => {
    expect(formatHealthFactor(MAX_UINT256)).toBe("No debt");
    expect(formatHealthFactor((14n * WAD) / 10n)).toBe("1.40");
    expect(formatHealthFactor(WAD * 5_000n)).toBe(">1,000");
    expect(healthBand(MAX_UINT256)).toBe("none");
    expect(healthBand(2n * WAD)).toBe("healthy");
    expect(healthBand((12n * WAD) / 10n)).toBe("watch");
    expect(healthBand((105n * WAD) / 100n)).toBe("risk");
    expect(healthBand(WAD - 1n)).toBe("liquidatable");
    expect(healthBand(null)).toBe("none");
  });

  it("formatRatioPct and formatPrice18", () => {
    expect(formatRatioPct(1n, 3n)).toBe("33.33%");
    expect(formatRatioPct(1n, 0n)).toBe("0.00%");
    expect(formatPrice18(75_591_620_000_000_000_000_000n)).toBe("$75,591.62");
    expect(formatPrice18(998_700_000_000_000_000n)).toBe("$0.9987");
  });

  it("addresses, hashes, explorer links", () => {
    const addr = "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503";
    expect(shortAddress(addr)).toBe("0x1189…c503");
    expect(shortAddress(null)).toBe(DASH);
    const hash = "0x" + "ab".repeat(32);
    expect(shortHash(hash)).toBe("0xabababab…ababab");
    expect(explorer.tx(hash)).toBe(`https://explorer.test.mezo.org/tx/${hash}`);
    expect(explorer.address(addr)).toBe(`https://explorer.test.mezo.org/address/${addr}`);
    expect(explorer.token(addr)).toBe(`https://explorer.test.mezo.org/token/${addr}`);
  });
});
