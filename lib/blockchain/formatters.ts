import { formatUnits, type Address, type Hash } from "viem";
import { mosaicConfig } from "./config";
import { MAX_UINT256, WAD } from "@/lib/oracle/math";
import type { HealthBand } from "@/types/mosaic";

/** Display placeholder for null / unavailable numbers (never "NaN" or "undefined"). */
export const DASH = "--";

function groupThousands(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * bigint -> fixed-decimal string with thousands separators.
 * Truncates (never rounds up) so users never see more than they have.
 * Trailing zeros are trimmed unless `fixed` is true.
 */
export function formatBigint(
  value: bigint | null | undefined,
  decimals: number,
  opts: { maxFraction?: number; minFraction?: number; fixed?: boolean } = {},
): string {
  if (value === null || value === undefined) return DASH;
  const maxFraction = opts.maxFraction ?? Math.min(decimals, 6);
  const minFraction = opts.minFraction ?? 0;
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const raw = formatUnits(abs, decimals);
  const [intPart, fracPartRaw = ""] = raw.split(".");
  let frac = fracPartRaw.slice(0, maxFraction);
  if (!opts.fixed) frac = frac.replace(/0+$/, "");
  while (frac.length < minFraction) frac += "0";
  const joined = frac.length ? `${groupThousands(intPart)}.${frac}` : groupThousands(intPart);
  // A non-zero value that truncates to zero gets a "less than" marker, never "-0".
  if (abs > 0n && /^[0.,]*$/.test(joined)) {
    const unit = maxFraction > 0 ? `0.${"0".repeat(maxFraction - 1)}1` : "1";
    return `<${unit}`;
  }
  if (abs === 0n) return opts.fixed ? joined : "0";
  return negative ? `-${joined}` : joined;
}

/** USD stored as 18-dec fixed point -> "$1,234.56" (2 decimals; tiny -> "<$0.01"). */
export function formatUsd18(value: bigint | null | undefined, fraction = 2): string {
  if (value === null || value === undefined) return DASH;
  const s = formatBigint(value, 18, { maxFraction: fraction, minFraction: fraction, fixed: true });
  if (s.startsWith("<")) return `<$${s.slice(1)}`;
  if (s.startsWith("-")) return `-$${s.slice(1)}`;
  return `$${s}`;
}

/** Token amount with sensible dynamic decimals by magnitude (display-only). */
export function formatTokenAmount(
  value: bigint | null | undefined,
  decimals: number,
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined) return DASH;
  const whole = value / 10n ** BigInt(decimals);
  const maxFraction = opts.compact
    ? whole >= 1000n
      ? 2
      : whole >= 1n
        ? 4
        : Math.min(decimals, 6)
    : Math.min(decimals, 8);
  return formatBigint(value, decimals, { maxFraction });
}

/** Basis points -> "60.00%" */
export function formatBps(bps: bigint | number | null | undefined, fraction = 2): string {
  if (bps === null || bps === undefined) return DASH;
  const b = typeof bps === "number" ? BigInt(Math.trunc(bps)) : bps;
  const whole = b / 100n;
  const rem = b % 100n;
  if (fraction === 0) return `${whole.toString()}%`;
  const fracStr = rem.toString().padStart(2, "0").slice(0, fraction).padEnd(fraction, "0");
  return `${groupThousands(whole.toString())}.${fracStr}%`;
}

/** WAD health factor -> "1.42"; MAX_UINT256 (no debt) -> "No debt". */
export function formatHealthFactor(hf: bigint | null | undefined): string {
  if (hf === null || hf === undefined) return DASH;
  if (hf === MAX_UINT256) return "No debt";
  if (hf > 1000n * WAD) return ">1,000";
  return formatBigint(hf, 18, { maxFraction: 2, minFraction: 2, fixed: true });
}

/** DESIGN.md bands: >= 1.5 green, 1.1 to 1.5 amber, < 1.1 red, < 1.0 liquidatable. */
export function healthBand(hf: bigint | null | undefined, debt?: bigint): HealthBand {
  if (hf === null || hf === undefined) return "none";
  if (hf === MAX_UINT256 || debt === 0n) return "none";
  if (hf < WAD) return "liquidatable";
  if (hf < (WAD * 11n) / 10n) return "risk";
  if (hf < (WAD * 15n) / 10n) return "watch";
  return "healthy";
}

export function shortAddress(address: string | null | undefined, chars = 4): string {
  if (!address) return DASH;
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

export function shortHash(hash: string | null | undefined): string {
  if (!hash) return DASH;
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

const base = () => mosaicConfig.explorerUrl.replace(/\/$/, "");
export const explorer = {
  tx: (hash: Hash | string) => `${base()}/tx/${hash}`,
  address: (address: Address | string) => `${base()}/address/${address}`,
  token: (address: Address | string) => `${base()}/token/${address}`,
};

/** "x.xx%" utilisation from two bigints without floats (2 dp). */
export function formatRatioPct(numerator: bigint, denominator: bigint): string {
  if (denominator === 0n) return "0.00%";
  const bps = (numerator * 10_000n) / denominator;
  return formatBps(bps);
}

/** Price with 18-dec normalisation -> "$75,591.62" */
export function formatPrice18(price: bigint | null | undefined): string {
  if (price === null || price === undefined) return DASH;
  const whole = price / WAD;
  // Small prices (stablecoins, sub-dollar) get 4 decimals so they do not read as "$1.00" when they are $0.9987.
  return formatUsd18(price, whole >= 100n ? 2 : 4);
}
