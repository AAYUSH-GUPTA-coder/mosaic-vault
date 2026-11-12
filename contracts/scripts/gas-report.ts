/**
 * Prints gas used by the main user flows on the in-process network (for docs/TEST_REPORT.md).
 *   npx hardhat run scripts/gas-report.ts
 */
import { network } from "hardhat";
import { keccak256, toBytes, parseUnits, type Hash } from "viem";

const role = (n: string) => keccak256(toBytes(n));
const MAX = (1n << 256n) - 1n;

async function main() {
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const [admin, alice, lp, liquidator] = await viem.getWalletClients();
  const musd = await viem.deployContract("MockERC20", ["MUSD", "MUSD", 18]);
  const twbtc = await viem.deployContract("TestCollateralToken", ["tWBTC", "tWBTC", 8, parseUnits("10", 8)]);
  const registry = await viem.deployContract("CollateralRegistry", [admin.account.address]);
  const oracle = await viem.deployContract("TestPriceOracle", [admin.account.address]);
  const pool = await viem.deployContract("MosaicLendingPool", [musd.address, admin.account.address]);
  const vault = await viem.deployContract("CollateralVault", [admin.account.address]);
  const engine = await viem.deployContract("MosaicLendingEngine", [registry.address, vault.address, pool.address, musd.address, admin.account.address]);
  const liq = await viem.deployContract("MosaicLiquidationEngine", [engine.address, registry.address, musd.address]);
  await vault.write.grantRole([role("ENGINE_ROLE"), engine.address]);
  await pool.write.grantRole([role("ENGINE_ROLE"), engine.address]);
  await pool.write.grantRole([role("LIQUIDITY_PROVIDER_ROLE"), lp.account.address]);
  await engine.write.grantRole([role("LIQUIDATION_ENGINE_ROLE"), liq.address]);
  await oracle.write.setPrice([twbtc.address, parseUnits("100000", 8), 8]);
  await musd.write.mint([lp.account.address, parseUnits("1000", 18)]);
  await musd.write.approve([pool.address, MAX], { account: lp.account });
  const rows: [string, bigint][] = [];
  const g = async (label: string, p: Promise<Hash>) => {
    const r = await pc.waitForTransactionReceipt({ hash: await p });
    rows.push([label, r.gasUsed]);
  };
  await g("registry.addCollateralAsset", registry.write.addCollateralAsset([twbtc.address, oracle.address, 1, 6000, 7000, 800, parseUnits("500", 18), parseUnits("10", 8), 10_000n]));
  await g("pool.depositLiquidity (LP)", pool.write.depositLiquidity([parseUnits("1000", 18)], { account: lp.account }));
  await twbtc.write.mintTo([alice.account.address, parseUnits("1", 8)]);
  await twbtc.write.approve([engine.address, MAX], { account: alice.account });
  await musd.write.approve([engine.address, MAX], { account: alice.account });
  await g("engine.addCollateral (first deposit)", engine.write.addCollateral([twbtc.address, parseUnits("0.005", 8)], { account: alice.account }));
  await g("engine.addCollateral (top-up)", engine.write.addCollateral([twbtc.address, parseUnits("0.001", 8)], { account: alice.account }));
  await g("engine.borrow", engine.write.borrow([twbtc.address, parseUnits("200", 18)], { account: alice.account }));
  await g("engine.repay (partial)", engine.write.repay([twbtc.address, parseUnits("50", 18)], { account: alice.account }));
  await g("engine.withdrawCollateral (with debt)", engine.write.withdrawCollateral([twbtc.address, parseUnits("0.001", 8), alice.account.address], { account: alice.account }));
  await g("engine.openPosition (deposit+borrow)", engine.write.openPosition([twbtc.address, parseUnits("0.004", 8), parseUnits("100", 18)], { account: alice.account }));
  await oracle.write.setPrice([twbtc.address, parseUnits("35000", 8), 8]);
  await musd.write.mint([liquidator.account.address, parseUnits("1000", 18)]);
  await musd.write.approve([engine.address, MAX], { account: liquidator.account });
  await g("liquidationEngine.liquidate (partial)", liq.write.liquidate([alice.account.address, twbtc.address, parseUnits("100", 18)], { account: liquidator.account }));
  await g("liquidationEngine.liquidate (full, closes)", liq.write.liquidate([alice.account.address, twbtc.address, MAX], { account: liquidator.account }));
  const sizes: [string, number][] = [];
  for (const c of [registry, vault, pool, engine, liq, oracle] as const) {
    const code = await pc.getCode({ address: c.address });
    sizes.push([c.address, (code!.length - 2) / 2]);
  }
  console.log("| Flow | Gas used |\n|---|---:|");
  for (const [l, gas] of rows) console.log(`| ${l} | ${gas.toLocaleString("en-US")} |`);
  console.log("\nDeployed bytecode sizes (bytes): " + ["CollateralRegistry", "CollateralVault", "MosaicLendingPool", "MosaicLendingEngine", "MosaicLiquidationEngine", "TestPriceOracle"].map((n, i) => `${n}=${sizes[i][1]}`).join(", "));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
