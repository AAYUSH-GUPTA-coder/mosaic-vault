import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { keccak256, toBytes, type Hash, type Address } from "viem";

export const MEZO_CHAIN_ID = 31611;
export const EXPLORER = "https://explorer.test.mezo.org";

/** Verified Mezo testnet addresses (docs/ARCHITECTURE.md). */
export const MEZO = {
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as Address,
  BTC: "0x7b7C000000000000000000000000000000000000" as Address,
  BTC_USD_FEED: "0x7b7c000000000000000000000000000000000015" as Address,
};

/** Testnet-only risk parameters (docs/ARCHITECTURE.md). USD values 18 dec, ratios bps. */
export const PARAMS = {
  BTC: { maxLtv: 6000, liqThreshold: 7000, penalty: 800, borrowCap: 500n * 10n ** 18n, maxExposure: 5n * 10n ** 17n, minDeposit: 10n ** 14n },
  tWBTC: { maxLtv: 6000, liqThreshold: 7000, penalty: 800, borrowCap: 500n * 10n ** 18n, maxExposure: 10n * 10n ** 8n, minDeposit: 10n ** 4n },
  tUSD: { maxLtv: 7000, liqThreshold: 8000, penalty: 500, borrowCap: 300n * 10n ** 18n, maxExposure: 100_000n * 10n ** 6n, minDeposit: 10n ** 6n },
};

export const ROLES = {
  DEFAULT_ADMIN_ROLE: "0x0000000000000000000000000000000000000000000000000000000000000000" as Hash,
  ENGINE_ROLE: roleHash("ENGINE_ROLE"),
  LIQUIDATION_ENGINE_ROLE: roleHash("LIQUIDATION_ENGINE_ROLE"),
  RISK_MANAGER_ROLE: roleHash("RISK_MANAGER_ROLE"),
  LIQUIDITY_PROVIDER_ROLE: roleHash("LIQUIDITY_PROVIDER_ROLE"),
  PAUSER_ROLE: roleHash("PAUSER_ROLE"),
  ORACLE_MANAGER_ROLE: roleHash("ORACLE_MANAGER_ROLE"),
};

function roleHash(name: string): Hash {
  return keccak256(toBytes(name));
}

export interface Deployment {
  chainId: number;
  deployer: Address;
  deployedAt: string;
  contracts: Record<
    "CollateralRegistry" | "ChainlinkFeedOracleAdapter" | "TestPriceOracle" | "MosaicLendingPool" | "CollateralVault" | "MosaicLendingEngine" | "MosaicLiquidationEngine",
    Address
  >;
  tokens: Record<"MUSD" | "BTC" | "tWBTC" | "tUSD", Address>;
  feeds: Record<"BTC", Address>;
  txs: Record<string, Hash>;
}

const here = dirname(fileURLToPath(import.meta.url));
export const deploymentsDir = resolve(here, "../../deployments");

export function deploymentPath(chainId: number): string {
  return resolve(deploymentsDir, chainId === MEZO_CHAIN_ID ? "mezo-testnet.json" : `chain-${chainId}.json`);
}

export function loadDeployment(chainId: number): Deployment | undefined {
  const p = deploymentPath(chainId);
  if (!existsSync(p)) return undefined;
  return JSON.parse(readFileSync(p, "utf8")) as Deployment;
}

export function saveDeployment(d: Deployment): string {
  mkdirSync(deploymentsDir, { recursive: true });
  const p = deploymentPath(d.chainId);
  writeFileSync(p, JSON.stringify(d, null, 2) + "\n");
  return p;
}

export function txLink(hash: Hash, chainId: number): string {
  return chainId === MEZO_CHAIN_ID ? `${EXPLORER}/tx/${hash}` : hash;
}

export function addressLink(addr: Address, chainId: number): string {
  return chainId === MEZO_CHAIN_ID ? `${EXPLORER}/address/${addr}` : addr;
}

/** Retries an RPC read up to `attempts` times with a short backoff. */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`  [retry ${i}/${attempts}] ${label}: ${(err as Error).message?.split("\n")[0]}`);
      if (i < attempts) await sleep(1_500 * i);
    }
  }
  throw lastErr;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function step(title: string): void {
  console.log(`\n== ${title}`);
}

export function fmt(amount: bigint, decimals: number, digits = 6): string {
  const neg = amount < 0n;
  const a = neg ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  const frac = (a % base).toString().padStart(decimals, "0").slice(0, digits).replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

export function fmtHf(hf: bigint): string {
  return hf >= (1n << 255n) ? "inf (no debt)" : fmt(hf, 18, 4);
}

export function assertCond(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}
