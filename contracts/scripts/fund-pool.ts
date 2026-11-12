/**
 * Funds MosaicLendingPool with MUSD from the deployer wallet.
 *   FUND_AMOUNT_MUSD=500 npx hardhat run scripts/fund-pool.ts --network mezoTestnet
 */
import { network } from "hardhat";
import { erc20Abi, parseUnits, type Hash } from "viem";
import { MEZO_CHAIN_ID, ROLES, loadDeployment, txLink, withRetry, step, fmt } from "./lib/common.js";

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const chainId = await withRetry("chainId", () => publicClient.getChainId());
  const d = loadDeployment(chainId);
  if (!d) throw new Error(`no deployment file for chain ${chainId}; run scripts/deploy.ts first`);
  const me = wallet.account.address;
  const amount = parseUnits(process.env.FUND_AMOUNT_MUSD ?? "500", 18);

  const pool = await viem.getContractAt("MosaicLendingPool", d.contracts.MosaicLendingPool);
  const musd = d.tokens.MUSD;

  async function wait(label: string, hashP: Promise<Hash>) {
    const hash = await hashP;
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`  ${label}: ${txLink(hash, chainId)}`);
  }

  step(`Fund pool ${d.contracts.MosaicLendingPool} with ${fmt(amount, 18)} MUSD from ${me}`);
  let balance = await withRetry("musd balance", () => publicClient.readContract({ address: musd, abi: erc20Abi, functionName: "balanceOf", args: [me] }));
  console.log(`  deployer MUSD balance: ${fmt(balance, 18)}`);
  if (chainId !== MEZO_CHAIN_ID && balance < amount) {
    // local dry run: MUSD is a MockERC20, mint what we need
    const mock = await viem.getContractAt("MockERC20", musd);
    await wait("mint mock MUSD (local only)", mock.write.mint([me, amount - balance]));
    balance = await mock.read.balanceOf([me]);
  }
  if (balance < amount) throw new Error(`insufficient MUSD: have ${fmt(balance, 18)}, need ${fmt(amount, 18)}`);

  const hasRole = await withRetry("hasRole LP", () => pool.read.hasRole([ROLES.LIQUIDITY_PROVIDER_ROLE, me]));
  if (!hasRole) {
    const isAdmin = await pool.read.hasRole([ROLES.DEFAULT_ADMIN_ROLE, me]);
    if (!isAdmin) throw new Error("wallet lacks LIQUIDITY_PROVIDER_ROLE and is not admin");
    await wait("grant LIQUIDITY_PROVIDER_ROLE", pool.write.grantRole([ROLES.LIQUIDITY_PROVIDER_ROLE, me]));
  }

  const allowance = await withRetry("allowance", () => publicClient.readContract({ address: musd, abi: erc20Abi, functionName: "allowance", args: [me, pool.address] }));
  if (allowance < amount) {
    await wait("approve pool", wallet.writeContract({ address: musd, abi: erc20Abi, functionName: "approve", args: [pool.address, amount] }));
  }
  const before = await pool.read.getAvailableLiquidity();
  await wait("depositLiquidity", pool.write.depositLiquidity([amount]));
  const after = await withRetry("liquidity", () => pool.read.getAvailableLiquidity());
  console.log(`  pool liquidity: ${fmt(before, 18)} -> ${fmt(after, 18)} MUSD`);
  if (after - before !== amount) throw new Error("pool liquidity did not increase by the deposited amount");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
