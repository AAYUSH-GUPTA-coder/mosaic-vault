import { erc20Abi, type Abi, type Address, type Hash, type PublicClient, type WalletClient } from "viem";
import { contracts, testOracleAt } from "./contracts";
import { testCollateralTokenAbi } from "./abis";
import { MEZO_TESTNET_CHAIN_ID, mezoTestnet } from "./chains";
import { WrongNetworkError } from "./errors";

/**
 * Write helpers. Every helper first asserts the wallet is on Mezo Testnet (31611)
 * and throws a typed WrongNetworkError otherwise, so no tx is ever sent elsewhere.
 * Each call is simulated first so reverts surface as decoded errors before gas is spent.
 */

export interface WriteContext {
  wallet: WalletClient;
  publicClient: PublicClient;
}

export async function assertMezoTestnet(wallet: WalletClient): Promise<void> {
  const chainId = wallet.chain?.id ?? (await wallet.getChainId().catch(() => undefined));
  if (chainId !== MEZO_TESTNET_CHAIN_ID) throw new WrongNetworkError(chainId);
}

function account(wallet: WalletClient): Address {
  const acct = wallet.account;
  if (!acct) throw new Error("Connect a wallet first.");
  return acct.address;
}

interface SendParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

async function send(ctx: WriteContext, p: SendParams): Promise<Hash> {
  await assertMezoTestnet(ctx.wallet);
  const from = account(ctx.wallet);
  const { request } = await ctx.publicClient.simulateContract({
    address: p.address,
    abi: p.abi,
    functionName: p.functionName,
    args: p.args as never,
    account: from,
    chain: mezoTestnet,
  });
  // Mezo nodes under-estimate gas for calls with internal try/catch (the oracle adapter), so pad the
  // estimate by 50%. If estimation fails, leave gas unset and let the wallet estimate.
  let gas: bigint | undefined;
  try {
    const est = await ctx.publicClient.estimateContractGas({
      address: p.address,
      abi: p.abi,
      functionName: p.functionName,
      args: p.args as never,
      account: from,
    });
    gas = (est * GAS_PAD_NUM) / GAS_PAD_DEN;
  } catch {
    gas = undefined;
  }
  return ctx.wallet.writeContract({ ...request, ...(gas ? { gas } : {}), account: from, chain: mezoTestnet } as never);
}

const GAS_PAD_NUM = 3n;
const GAS_PAD_DEN = 2n;

export async function approveToken(ctx: WriteContext, token: Address, spender: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] });
}

export async function faucet(ctx: WriteContext, token: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { address: token, abi: testCollateralTokenAbi, functionName: "faucet", args: [amount] });
}

export async function openPosition(ctx: WriteContext, asset: Address, collateralAmount: bigint, borrowAmount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "openPosition", args: [asset, collateralAmount, borrowAmount] });
}

export async function addCollateral(ctx: WriteContext, asset: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "addCollateral", args: [asset, amount] });
}

export async function borrow(ctx: WriteContext, asset: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "borrow", args: [asset, amount] });
}

export async function repay(ctx: WriteContext, asset: Address, amount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "repay", args: [asset, amount] });
}

export async function withdrawCollateral(ctx: WriteContext, asset: Address, amount: bigint, to?: Address): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "withdrawCollateral", args: [asset, amount, to ?? account(ctx.wallet)] });
}

export async function liquidate(ctx: WriteContext, user: Address, asset: Address, repayAmount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.liquidationEngine, functionName: "liquidate", args: [user, asset, repayAmount] });
}

// ---- Pool (LIQUIDITY_PROVIDER_ROLE) ----
export async function depositLiquidity(ctx: WriteContext, amount: bigint): Promise<Hash> {
  return send(ctx, { ...contracts.pool, functionName: "depositLiquidity", args: [amount] });
}

export async function withdrawLiquidity(ctx: WriteContext, amount: bigint, to: Address): Promise<Hash> {
  return send(ctx, { ...contracts.pool, functionName: "withdrawLiquidity", args: [amount, to] });
}

// ---- Engine (PAUSER_ROLE) ----
export async function pauseEngine(ctx: WriteContext): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "pause" });
}

export async function unpauseEngine(ctx: WriteContext): Promise<Hash> {
  return send(ctx, { ...contracts.engine, functionName: "unpause" });
}

// ---- Registry (RISK_MANAGER_ROLE) ----
export interface RegisterAssetParams {
  token: Address;
  oracle: Address;
  kind: 0 | 1;
  maxLtvBps: number;
  liquidationThresholdBps: number;
  liquidationPenaltyBps: number;
  borrowCap: bigint;
  maxExposure: bigint;
  minDeposit: bigint;
}

export async function addCollateralAsset(ctx: WriteContext, p: RegisterAssetParams): Promise<Hash> {
  return send(ctx, {
    ...contracts.registry,
    functionName: "addCollateralAsset",
    args: [p.token, p.oracle, p.kind, p.maxLtvBps, p.liquidationThresholdBps, p.liquidationPenaltyBps, p.borrowCap, p.maxExposure, p.minDeposit],
  });
}

export async function updateCollateralParameters(ctx: WriteContext, p: Omit<RegisterAssetParams, "oracle" | "kind">): Promise<Hash> {
  return send(ctx, {
    ...contracts.registry,
    functionName: "updateCollateralParameters",
    args: [p.token, p.maxLtvBps, p.liquidationThresholdBps, p.liquidationPenaltyBps, p.borrowCap, p.maxExposure, p.minDeposit],
  });
}

export async function setOracle(ctx: WriteContext, token: Address, oracle: Address): Promise<Hash> {
  return send(ctx, { ...contracts.registry, functionName: "setOracle", args: [token, oracle] });
}

export async function pauseCollateralAsset(ctx: WriteContext, token: Address): Promise<Hash> {
  return send(ctx, { ...contracts.registry, functionName: "pauseCollateralAsset", args: [token] });
}

export async function unpauseCollateralAsset(ctx: WriteContext, token: Address): Promise<Hash> {
  return send(ctx, { ...contracts.registry, functionName: "unpauseCollateralAsset", args: [token] });
}

// ---- TestPriceOracle (ORACLE_MANAGER_ROLE; test-only demo controls) ----
export async function testOracleSetPrice(ctx: WriteContext, oracle: Address, asset: Address, price: bigint, decimals: number): Promise<Hash> {
  return send(ctx, { ...testOracleAt(oracle), functionName: "setPrice", args: [asset, price, decimals] });
}

export async function testOracleSetInvalid(ctx: WriteContext, oracle: Address, asset: Address, invalid: boolean): Promise<Hash> {
  return send(ctx, { ...testOracleAt(oracle), functionName: "setInvalid", args: [asset, invalid] });
}
