/**
 * Real-BTC journey on Mezo testnet: deposit native testnet BTC (via the BTC ERC-20 precompile),
 * borrow MUSD, repay in full, withdraw in full.
 *   npx hardhat run scripts/btc-check.ts --network mezoTestnet   (env BTC_CHECK_AMOUNT, default 0.0005)
 */
import { network } from "hardhat";
import { erc20Abi, parseUnits, type Hash } from "viem";
import { loadDeployment, txLink, withRetry, step, fmt, fmtHf, assertCond } from "./lib/common.js";

const MAX = (1n << 256n) - 1n;

async function main() {
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const chainId = await pc.getChainId();
  const d = loadDeployment(chainId);
  if (!d) throw new Error("run deploy.ts first");
  const me = wallet.account.address;
  const btc = d.tokens.BTC;
  const engine = await viem.getContractAt("MosaicLendingEngine", d.contracts.MosaicLendingEngine);
  async function wait(label: string, p: Promise<Hash>) {
    const hash = await p;
    const r = await pc.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`  tx ${label}: ${txLink(hash, chainId)}`);
  }
  const view = () => withRetry("view", () => engine.read.getPositionView([me, btc]));
  const amt = parseUnits(process.env.BTC_CHECK_AMOUNT ?? "0.0005", 18);

  step("BTC 1. Approve BTC precompile -> engine");
  const al = await pc.readContract({ address: btc, abi: erc20Abi, functionName: "allowance", args: [me, engine.address] });
  if (al < amt) await wait("approve BTC", wallet.writeContract({ address: btc, abi: erc20Abi, functionName: "approve", args: [engine.address, MAX] }));

  step("BTC 2. Deposit testnet BTC");
  let v0 = await view();
  if (v0.collateral === 0n) await wait(`addCollateral ${fmt(amt, 18)} BTC`, engine.write.addCollateral([btc, amt]));
  let v = await view();
  console.log(`  collateral ${fmt(v.collateral, 18)} BTC ($${fmt(v.collateralValueUsd, 18, 2)}), price valid=${v.priceValid}`);
  assertCond(v.collateral >= amt && v.priceValid, "BTC deposit recorded with a live Mezo BTC/USD price");

  step("BTC 3. Borrow MUSD against BTC");
  const borrowAmt = v.availableToBorrow / 2n;
  if (v.debt === 0n) await wait(`borrow ${fmt(borrowAmt, 18, 2)} MUSD`, engine.write.borrow([btc, borrowAmt]));
  v = await view();
  console.log(`  debt ${fmt(v.debt, 18, 2)} MUSD, HF ${fmtHf(v.healthFactor)}`);

  step("BTC 4. Repay all + withdraw all");
  const musd = d.tokens.MUSD;
  const mal = await pc.readContract({ address: musd, abi: erc20Abi, functionName: "allowance", args: [me, engine.address] });
  if (mal < MAX / 2n) await wait("approve MUSD", wallet.writeContract({ address: musd, abi: erc20Abi, functionName: "approve", args: [engine.address, MAX] }));
  await wait("repay all", engine.write.repay([btc, MAX]));
  v = await view();
  await wait("withdraw all BTC", engine.write.withdrawCollateral([btc, v.collateral, me]));
  v = await view();
  assertCond(v.debt === 0n && v.collateral === 0n, "BTC position closed");
  console.log("\nBTC check complete.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
