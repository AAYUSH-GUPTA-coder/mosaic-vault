/**
 * Real-chain demo journey on tWBTC with the deployer wallet, asserting on-chain state after each step:
 *   faucet -> deposit -> borrow -> add collateral (HF improves) -> partial repay -> safe withdraw
 *   -> close position 1 -> open a SEPARATE position 2 at max LTV -> lower TestPriceOracle price
 *   -> liquidate it (same wallet acts as liquidator) -> restore the price -> (optionally) reopen a healthy position.
 *
 *   npx hardhat run scripts/demo-flow.ts --network mezoTestnet
 *   env: DEMO_DEPOSIT_TWBTC (default 0.005), DEMO_REOPEN=0 to skip the final healthy position.
 */
import { network } from "hardhat";
import { erc20Abi, parseUnits, type Hash } from "viem";
import { loadDeployment, txLink, withRetry, step, fmt, fmtHf, assertCond } from "./lib/common.js";

const WAD = 10n ** 18n;
const BPS = 10_000n;
const MAX = (1n << 256n) - 1n;

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const chainId = await withRetry("chainId", () => publicClient.getChainId());
  const d = loadDeployment(chainId);
  if (!d) throw new Error(`no deployment file for chain ${chainId}; run scripts/deploy.ts first`);
  const me = wallet.account.address;

  const engine = await viem.getContractAt("MosaicLendingEngine", d.contracts.MosaicLendingEngine);
  const liq = await viem.getContractAt("MosaicLiquidationEngine", d.contracts.MosaicLiquidationEngine);
  const oracle = await viem.getContractAt("TestPriceOracle", d.contracts.TestPriceOracle);
  const registry = await viem.getContractAt("CollateralRegistry", d.contracts.CollateralRegistry);
  const pool = await viem.getContractAt("MosaicLendingPool", d.contracts.MosaicLendingPool);
  const vault = await viem.getContractAt("CollateralVault", d.contracts.CollateralVault);
  const twbtc = await viem.getContractAt("TestCollateralToken", d.tokens.tWBTC);
  const asset = d.tokens.tWBTC;
  const musd = d.tokens.MUSD;

  async function wait(label: string, hashP: Promise<Hash>) {
    const hash = await hashP;
    const r = await publicClient.waitForTransactionReceipt({ hash });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`  tx ${label}: ${txLink(hash, chainId)}`);
  }
  const view = () => withRetry("getPositionView", () => engine.read.getPositionView([me, asset]));
  const musdBal = () => withRetry("musd balance", () => publicClient.readContract({ address: musd, abi: erc20Abi, functionName: "balanceOf", args: [me] }));
  const show = (label: string, v: Awaited<ReturnType<typeof view>>) =>
    console.log(`  ${label}: collateral ${fmt(v.collateral, 8)} tWBTC ($${fmt(v.collateralValueUsd, 18, 2)}), debt ${fmt(v.debt, 18, 2)} MUSD, HF ${fmtHf(v.healthFactor)}, LTV ${Number(v.currentLtvBps) / 100}%, canBorrow ${fmt(v.availableToBorrow, 18, 2)}, price $${fmt(v.price, 18, 2)} valid=${v.priceValid}`);

  const cfg = await withRetry("config", () => registry.read.getCollateralConfig([asset]));
  const priceData = await withRetry("price", () => oracle.read.getPriceData([asset]));
  const originalPrice = priceData.price; // 8 dec
  assertCond(priceData.valid && originalPrice > 0n, `tWBTC oracle price valid (${fmt(originalPrice, 8, 2)} USD)`);
  const depositAmt = parseUnits(process.env.DEMO_DEPOSIT_TWBTC ?? "0.005", 8);

  // allowances (engine is the only spender)
  step("Approvals");
  const twbtcAllowance = await twbtc.read.allowance([me, engine.address]);
  if (twbtcAllowance < MAX / 2n) await wait("approve tWBTC -> engine", twbtc.write.approve([engine.address, MAX]));
  const musdAllowance = await publicClient.readContract({ address: musd, abi: erc20Abi, functionName: "allowance", args: [me, engine.address] });
  if (musdAllowance < MAX / 2n) await wait("approve MUSD -> engine", wallet.writeContract({ address: musd, abi: erc20Abi, functionName: "approve", args: [engine.address, MAX] }));

  // make sure we start from a clean tWBTC position (re-runnable)
  let v = await view();
  if (v.debt > 0n || v.collateral > 0n) {
    step("Closing a pre-existing tWBTC position so the demo starts clean");
    if (v.debt > 0n) {
      if ((await musdBal()) < v.debt) throw new Error("not enough MUSD to close the existing position");
      await wait("repay all", engine.write.repay([asset, MAX]));
    }
    if (v.collateral > 0n) await wait("withdraw all", engine.write.withdrawCollateral([asset, v.collateral, me]));
    v = await view();
    assertCond(v.debt === 0n && v.collateral === 0n, "position is empty");
  }

  // 1. faucet
  step("1. Faucet tWBTC");
  const need = depositAmt * 4n; // position 1 + extra collateral + position 2 + healthy reopen
  const have = await twbtc.read.balanceOf([me]);
  if (have < need) await wait(`faucet ${fmt(need, 8)} tWBTC`, twbtc.write.faucet([need]));
  assertCond((await twbtc.read.balanceOf([me])) >= need, `wallet holds >= ${fmt(need, 8)} tWBTC`);

  // 2. deposit
  step("2. Deposit collateral");
  await wait(`addCollateral ${fmt(depositAmt, 8)} tWBTC`, engine.write.addCollateral([asset, depositAmt]));
  v = await view();
  show("after deposit", v);
  assertCond(v.collateral === depositAmt, "collateral credited exactly");
  assertCond((await vault.read.getCollateralBalance([me, asset])) === depositAmt, "vault accounting matches");
  assertCond(v.healthFactor === MAX, "no debt => HF infinite");

  // 3. borrow ~50% of max debt (bounded by pool liquidity and borrow cap)
  step("3. Borrow MUSD");
  const borrowAmt = v.maxDebtUsd / 2n < v.availableToBorrow ? v.maxDebtUsd / 2n : v.availableToBorrow;
  if (borrowAmt === 0n) throw new Error("nothing borrowable: fund the pool (scripts/fund-pool.ts) or check the borrow cap");
  const musdBefore = await musdBal();
  await wait(`borrow ${fmt(borrowAmt, 18, 2)} MUSD`, engine.write.borrow([asset, borrowAmt]));
  v = await view();
  show("after borrow", v);
  assertCond(v.debt === borrowAmt, "debt recorded");
  assertCond((await musdBal()) - musdBefore === borrowAmt, "MUSD received");
  assertCond(v.healthFactor >= WAD, "position healthy");
  const hfAfterBorrow = v.healthFactor;

  // 4. add collateral -> HF improves
  step("4. Add collateral");
  const extra = depositAmt / 2n;
  await wait(`addCollateral ${fmt(extra, 8)} tWBTC`, engine.write.addCollateral([asset, extra]));
  v = await view();
  show("after add", v);
  assertCond(v.collateral === depositAmt + extra, "collateral increased");
  assertCond(v.healthFactor > hfAfterBorrow, `HF improved (${fmtHf(hfAfterBorrow)} -> ${fmtHf(v.healthFactor)})`);

  // 5. partial repay
  step("5. Partial repay");
  const repayAmt = v.debt / 2n;
  await wait(`repay ${fmt(repayAmt, 18, 2)} MUSD`, engine.write.repay([asset, repayAmt]));
  const debtAfterRepay = (await view()).debt;
  assertCond(debtAfterRepay === v.debt - repayAmt, "debt reduced by exactly the repaid amount");
  v = await view();
  show("after repay", v);

  // 6. safe withdraw: keep enough collateral for debt <= maxDebt (with 2% buffer), remaining >= minDeposit
  step("6. Safe withdraw");
  const requiredUsd = (v.debt * BPS) / BigInt(cfg.maxLtvBps);
  const price8 = (await oracle.read.getPriceData([asset])).price;
  let requiredCollateral = (requiredUsd * 10n ** 16n) / (price8 * WAD) + 1n; // fromUsd(usd, 8, price, 8)
  requiredCollateral = (requiredCollateral * 102n) / 100n;
  if (requiredCollateral < cfg.minDeposit) requiredCollateral = cfg.minDeposit;
  const withdrawAmt = v.collateral > requiredCollateral ? v.collateral - requiredCollateral : 0n;
  if (withdrawAmt > 0n) {
    await wait(`withdrawCollateral ${fmt(withdrawAmt, 8)} tWBTC`, engine.write.withdrawCollateral([asset, withdrawAmt, me]));
    v = await view();
    show("after withdraw", v);
    assertCond(v.collateral === depositAmt + extra - withdrawAmt, "collateral reduced");
    assertCond(v.healthFactor >= WAD && v.debt <= v.maxDebtUsd, "still safe after withdrawal");
  } else {
    console.log("  nothing safely withdrawable; skipping");
  }

  // 7. close position 1 so position 2 is a separate, fresh position for the liquidation demo
  step("7. Close position 1");
  await wait("repay remaining", engine.write.repay([asset, MAX]));
  v = await view();
  await wait("withdraw remaining", engine.write.withdrawCollateral([asset, v.collateral, me]));
  v = await view();
  assertCond(v.debt === 0n && v.collateral === 0n, "position 1 closed");

  // 8. position 2 at max LTV, price drop, liquidation by the same wallet
  step("8. Liquidation demo on a separate position");
  const p2 = depositAmt;
  await wait(`openPosition deposit ${fmt(p2, 8)} tWBTC`, engine.write.openPosition([asset, p2, 0n]));
  v = await view();
  const maxBorrow = v.availableToBorrow < v.maxDebtUsd ? v.availableToBorrow : v.maxDebtUsd;
  if (maxBorrow === 0n) throw new Error("cannot borrow for position 2 (pool liquidity / cap)");
  await wait(`borrow ${fmt(maxBorrow, 18, 2)} MUSD (max LTV)`, engine.write.borrow([asset, maxBorrow]));
  v = await view();
  show("position 2", v);
  assertCond(!(await liq.read.isLiquidatable([me, asset])), "position 2 is healthy before the price drop");

  // drop so that HF < 1: HF = value*thr/debt; want value*thr/debt = 0.95 -> price = 0.95*debt*BPS/(thr*collateral)
  const targetUsdPerToken = (95n * v.debt * BPS * 10n ** 8n) / (100n * BigInt(cfg.liquidationThresholdBps) * v.collateral); // 18-dec USD per whole token
  const droppedPrice8 = targetUsdPerToken / 10n ** 10n;
  await wait(`setPrice tWBTC -> $${fmt(droppedPrice8, 8, 2)}`, oracle.write.setPrice([asset, droppedPrice8, 8]));
  v = await view();
  show("after price drop", v);
  assertCond(v.healthFactor < WAD, "HF < 1");
  assertCond(await liq.read.isLiquidatable([me, asset]), "isLiquidatable == true");

  const [debtToRepay, collateralToSeize, , liquidatable] = await liq.read.getLiquidationQuote([me, asset, v.debt]);
  assertCond(liquidatable, `quote: repay ${fmt(debtToRepay, 18, 2)} MUSD, seize ${fmt(collateralToSeize, 8)} tWBTC`);
  if ((await musdBal()) < debtToRepay) throw new Error("not enough MUSD to liquidate");
  const twbtcBefore = await twbtc.read.balanceOf([me]);
  const poolBefore = await pool.read.getAvailableLiquidity();
  await wait("liquidate (same wallet acts as liquidator)", liq.write.liquidate([me, asset, debtToRepay]));
  v = await view();
  show("after liquidation", v);
  assertCond(v.debt === 0n, "debt cleared");
  assertCond((await twbtc.read.balanceOf([me])) - twbtcBefore === collateralToSeize, "liquidator received seized collateral");
  assertCond((await pool.read.getAvailableLiquidity()) - poolBefore === debtToRepay, "pool received repayment");
  assertCond(!(await liq.read.isLiquidatable([me, asset])), "double liquidation impossible (not liquidatable)");

  step("9. Restore price");
  await wait(`setPrice tWBTC -> $${fmt(originalPrice, 8, 2)}`, oracle.write.setPrice([asset, originalPrice, 8]));
  assertCond((await oracle.read.getPriceData([asset])).price === originalPrice, "price restored");
  if (v.collateral > 0n) {
    await wait("withdraw leftover collateral", engine.write.withdrawCollateral([asset, v.collateral, me]));
  }

  if (process.env.DEMO_REOPEN !== "0") {
    step("10. Reopen a healthy position for the UI");
    await wait(`openPosition ${fmt(depositAmt, 8)} tWBTC + borrow`, engine.write.openPosition([asset, depositAmt, 0n]));
    v = await view();
    const b = v.maxDebtUsd / 3n < v.availableToBorrow ? v.maxDebtUsd / 3n : v.availableToBorrow;
    if (b > 0n) await wait(`borrow ${fmt(b, 18, 2)} MUSD`, engine.write.borrow([asset, b]));
    show("final", await view());
  }

  step("Invariants");
  assertCond((await twbtc.read.balanceOf([vault.address])) >= (await vault.read.getTotalCollateral([asset])), "vault balance >= accounting");
  assertCond((await pool.read.getAvailableLiquidity()) === (await publicClient.readContract({ address: musd, abi: erc20Abi, functionName: "balanceOf", args: [pool.address] })), "pool liquidity == MUSD balance");
  console.log("\nDemo flow complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
