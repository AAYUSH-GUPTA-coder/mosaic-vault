import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { network } from "hardhat";
import { parseUnits, keccak256, toBytes, type Address } from "viem";

/**
 * End-to-end flow tests against the in-process EDR network. Mirrors the real-chain journey the demo script runs:
 * deposit -> borrow -> add collateral (HF improves) -> partial repay -> safe withdraw -> price drop -> liquidate.
 */

const WAD = 10n ** 18n;
const MAX_UINT = (1n << 256n) - 1n;
const role = (name: string) => keccak256(toBytes(name));

type Fixture = Awaited<ReturnType<typeof deployFixture>>;

async function deployFixture() {
  const conn = await network.connect();
  const { viem, networkHelpers } = conn;
  const publicClient = await viem.getPublicClient();
  const [admin, alice, lp, liquidator, bob] = await viem.getWalletClients();

  const musd = await viem.deployContract("MockERC20", ["Mezo USD", "MUSD", 18]);
  const twbtc = await viem.deployContract("TestCollateralToken", ["Mosaic Test Wrapped BTC (test-only)", "tWBTC", 8, parseUnits("10", 8)]);
  const tusd = await viem.deployContract("TestCollateralToken", ["Mosaic Test Stablecoin (test-only)", "tUSD", 6, parseUnits("100000", 6)]);

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
  await oracle.write.setPrice([tusd.address, parseUnits("1", 8), 8]);

  // ARCHITECTURE.md testnet parameters (tWBTC: 60/70/8%, cap 500 MUSD, exposure 10 tWBTC, min 0.0001)
  await registry.write.addCollateralAsset([twbtc.address, oracle.address, 1, 6000, 7000, 800, parseUnits("500", 18), parseUnits("10", 8), parseUnits("0.0001", 8)]);
  await registry.write.addCollateralAsset([tusd.address, oracle.address, 1, 7000, 8000, 500, parseUnits("300", 18), parseUnits("100000", 6), parseUnits("1", 6)]);

  // fund the pool with 1,000 MUSD
  await musd.write.mint([lp.account.address, parseUnits("1000", 18)]);
  await musd.write.approve([pool.address, MAX_UINT], { account: lp.account });
  await pool.write.depositLiquidity([parseUnits("1000", 18)], { account: lp.account });

  return { viem, networkHelpers, publicClient, admin, alice, lp, liquidator, bob, musd, twbtc, tusd, registry, oracle, pool, vault, engine, liq };
}

const view = async (f: Fixture, user: Address, asset: Address) => f.engine.read.getPositionView([user, asset]);

describe("Mosaic Vault end-to-end flows", () => {
  let f: Fixture;
  before(async () => {
    f = await deployFixture();
  });

  it("runs the full journey: deposit -> borrow -> add collateral -> partial repay -> safe withdraw -> price drop -> liquidate", async () => {
    const { alice, liquidator, musd, twbtc, oracle, engine, liq, pool, vault, publicClient } = f;
    const asset = twbtc.address;
    const a = alice.account;

    // 1. faucet + approve the ENGINE only
    await twbtc.write.mintTo([a.address, parseUnits("0.01", 8)]); // deployer holds MINTER_ROLE
    await twbtc.write.approve([engine.address, MAX_UINT], { account: a });
    assert.equal(await twbtc.read.allowance([a.address, vault.address]), 0n, "vault is never approved");

    // 2. deposit 0.005 tWBTC ($500)
    const depositHash = await engine.write.addCollateral([asset, parseUnits("0.005", 8)], { account: a });
    await publicClient.waitForTransactionReceipt({ hash: depositHash });
    let v = await view(f, a.address, asset);
    assert.equal(v.collateral, parseUnits("0.005", 8));
    assert.equal(v.collateralValueUsd, parseUnits("500", 18));
    assert.equal(v.maxDebtUsd, parseUnits("300", 18));
    assert.equal(v.availableToBorrow, parseUnits("300", 18));
    assert.equal(v.healthFactor, MAX_UINT);
    assert.equal(await vault.read.getCollateralBalance([a.address, asset]), parseUnits("0.005", 8));

    // 3. borrow 250 MUSD (LTV 50%)
    await f.viem.assertions.emitWithArgs(
      engine.write.borrow([asset, parseUnits("250", 18)], { account: a }),
      engine,
      "Borrowed",
      [a.address, asset, parseUnits("250", 18), parseUnits("250", 18)],
    );
    assert.equal(await musd.read.balanceOf([a.address]), parseUnits("250", 18));
    v = await view(f, a.address, asset);
    assert.equal(v.debt, parseUnits("250", 18));
    assert.equal(v.currentLtvBps, 5000n);
    const hfAfterBorrow = v.healthFactor; // 500*0.7/250 = 1.4
    assert.equal(hfAfterBorrow, 1_400_000_000_000_000_000n);
    assert.equal(await pool.read.getAvailableLiquidity(), parseUnits("750", 18));
    assert.equal(await pool.read.getOutstandingDebt([asset]), parseUnits("250", 18));

    // borrowing above max LTV is rejected
    await f.viem.assertions.revertWithCustomError(
      engine.write.borrow([asset, parseUnits("51", 18)], { account: a }),
      engine,
      "ExceedsMaxLtv",
    );

    // 4. add collateral -> HF improves
    await engine.write.addCollateral([asset, parseUnits("0.002", 8)], { account: a });
    v = await view(f, a.address, asset);
    assert.equal(v.collateral, parseUnits("0.007", 8));
    assert.ok(v.healthFactor > hfAfterBorrow, "HF must improve after adding collateral");
    assert.equal(v.healthFactor, 1_960_000_000_000_000_000n); // 700*0.7/250

    // 5. partial repay 100 MUSD
    await musd.write.approve([engine.address, MAX_UINT], { account: a });
    await engine.write.repay([asset, parseUnits("100", 18)], { account: a });
    v = await view(f, a.address, asset);
    assert.equal(v.debt, parseUnits("150", 18));
    assert.equal(await pool.read.getAvailableLiquidity(), parseUnits("850", 18));

    // 6. safe withdraw: debt 150 => need >= $250 collateral at 60% LTV => keep 0.0025; withdraw 0.004
    await f.viem.assertions.revertWithCustomError(
      engine.write.withdrawCollateral([asset, parseUnits("0.0046", 8), a.address], { account: a }),
      engine,
      "UnsafeWithdrawal",
    );
    await engine.write.withdrawCollateral([asset, parseUnits("0.004", 8), a.address], { account: a });
    v = await view(f, a.address, asset);
    assert.equal(v.collateral, parseUnits("0.003", 8)); // $300, debt 150 => LTV 50%, HF 1.4
    assert.equal(v.healthFactor, 1_400_000_000_000_000_000n);
    assert.equal(await twbtc.read.balanceOf([a.address]), parseUnits("0.007", 8));

    // 7. price drop: $100k -> $60k => collateral $180, HF = 126/150 = 0.84
    await oracle.write.setPrice([asset, parseUnits("60000", 8), 8]);
    v = await view(f, a.address, asset);
    assert.equal(v.healthFactor, 840_000_000_000_000_000n);
    assert.equal(await liq.read.isLiquidatable([a.address, asset]), true);
    assert.equal(v.availableToBorrow, 0n);

    // 8. liquidate: repay 150 -> seize 150*1.08/60000 = 0.0027 tWBTC
    await musd.write.mint([liquidator.account.address, parseUnits("150", 18)]);
    await musd.write.approve([engine.address, MAX_UINT], { account: liquidator.account });
    const [debtToRepay, collateralToSeize, price, liquidatable] = await liq.read.getLiquidationQuote([a.address, asset, parseUnits("150", 18)]);
    assert.equal(liquidatable, true);
    assert.equal(debtToRepay, parseUnits("150", 18));
    assert.equal(collateralToSeize, parseUnits("0.0027", 8));
    assert.equal(price, parseUnits("60000", 18));
    await f.viem.assertions.emitWithArgs(
      liq.write.liquidate([a.address, asset, parseUnits("150", 18)], { account: liquidator.account }),
      liq,
      "Liquidation",
      [a.address, asset, liquidator.account.address, parseUnits("150", 18), parseUnits("0.0027", 8), parseUnits("60000", 18)],
    );
    v = await view(f, a.address, asset);
    assert.equal(v.debt, 0n);
    assert.equal(v.collateral, parseUnits("0.0003", 8));
    assert.equal(await twbtc.read.balanceOf([liquidator.account.address]), parseUnits("0.0027", 8));
    assert.equal(await pool.read.getAvailableLiquidity(), parseUnits("1000", 18), "pool whole again");
    assert.equal(await pool.read.totalBadDebt(), 0n);

    // 9. double liquidation is impossible
    await f.viem.assertions.revertWithCustomError(
      liq.write.liquidate([a.address, asset, 1n], { account: liquidator.account }),
      liq,
      "NotLiquidatable",
    );

    // invariants after the whole flow
    assert.ok((await twbtc.read.balanceOf([vault.address])) >= (await vault.read.getTotalCollateral([asset])));
    assert.equal(await pool.read.getAvailableLiquidity(), await musd.read.balanceOf([pool.address]));
    await oracle.write.setPrice([asset, parseUnits("100000", 8), 8]);
  });

  it("six-decimal tUSD collateral normalises correctly and respects its own caps", async () => {
    const { bob, tusd, engine, pool } = f;
    const b = bob.account;
    await tusd.write.mintTo([b.address, parseUnits("1000", 6)]);
    await tusd.write.approve([engine.address, MAX_UINT], { account: b });
    await engine.write.openPosition([tusd.address, parseUnits("1000", 6), parseUnits("200", 18)], { account: b });
    const v = await view(f, b.address, tusd.address);
    assert.equal(v.collateralValueUsd, parseUnits("1000", 18));
    assert.equal(v.maxDebtUsd, parseUnits("700", 18));
    assert.equal(v.debt, parseUnits("200", 18));
    assert.equal(v.price, parseUnits("1", 18));
    // borrow cap for tUSD is 300 MUSD
    assert.equal(v.availableToBorrow, parseUnits("100", 18));
    await f.viem.assertions.revertWithCustomError(
      engine.write.borrow([tusd.address, parseUnits("101", 18)], { account: b }),
      engine,
      "ExceedsBorrowCap",
    );
    assert.equal(await pool.read.getOutstandingDebt([tusd.address]), parseUnits("200", 18));
  });

  it("stale oracle blocks borrow and withdraw-with-debt but not deposit or repay", async () => {
    const { bob, tusd, engine, oracle, musd, networkHelpers } = f;
    const b = bob.account;
    await networkHelpers.time.increase(86_401); // TestPriceOracle default staleness = 1 day
    assert.equal(await oracle.read.isPriceValid([tusd.address]), false);
    await f.viem.assertions.revertWithCustomError(
      engine.write.borrow([tusd.address, 1n], { account: b }),
      engine,
      "OraclePriceInvalid",
    );
    await f.viem.assertions.revertWithCustomError(
      engine.write.withdrawCollateral([tusd.address, 1n, b.address], { account: b }),
      engine,
      "OraclePriceInvalid",
    );
    assert.equal(await engine.read.getBorrowingCapacity([b.address, tusd.address]), 0n);
    await tusd.write.mintTo([b.address, parseUnits("10", 6)]);
    await engine.write.addCollateral([tusd.address, parseUnits("10", 6)], { account: b }); // deposit works
    await musd.write.approve([engine.address, MAX_UINT], { account: b });
    await engine.write.repay([tusd.address, parseUnits("50", 18)], { account: b }); // repay works
    assert.equal((await view(f, b.address, tusd.address)).debt, parseUnits("150", 18));
    await oracle.write.setPrice([tusd.address, parseUnits("1", 8), 8]); // refresh
    assert.equal(await oracle.read.isPriceValid([tusd.address]), true);
  });

  it("emergency pause keeps repay open and blocks everything else", async () => {
    const { admin, bob, tusd, engine } = f;
    const b = bob.account;
    await engine.write.pause({ account: admin.account });
    await f.viem.assertions.revertWithCustomError(engine.write.addCollateral([tusd.address, 1n], { account: b }), engine, "EnforcedPause");
    await f.viem.assertions.revertWithCustomError(engine.write.borrow([tusd.address, 1n], { account: b }), engine, "EnforcedPause");
    await f.viem.assertions.revertWithCustomError(engine.write.withdrawCollateral([tusd.address, 1n, b.address], { account: b }), engine, "EnforcedPause");
    await f.viem.assertions.revertWithCustomError(engine.write.openPosition([tusd.address, 1n, 0n], { account: b }), engine, "EnforcedPause");
    await engine.write.repay([tusd.address, parseUnits("10", 18)], { account: b });
    assert.equal((await view(f, b.address, tusd.address)).debt, parseUnits("140", 18));
    await engine.write.unpause({ account: admin.account });
  });

  it("unauthorized accounts cannot touch role-gated functions", async () => {
    const { bob, registry, vault, pool, engine, oracle, tusd } = f;
    const b = bob.account;
    await f.viem.assertions.revertWithCustomError(
      registry.write.pauseCollateralAsset([tusd.address], { account: b }), registry, "AccessControlUnauthorizedAccount");
    await f.viem.assertions.revertWithCustomError(
      vault.write.withdrawCollateral([tusd.address, b.address, b.address, 1n], { account: b }), vault, "AccessControlUnauthorizedAccount");
    await f.viem.assertions.revertWithCustomError(
      pool.write.lendToBorrower([tusd.address, b.address, 1n], { account: b }), pool, "AccessControlUnauthorizedAccount");
    await f.viem.assertions.revertWithCustomError(
      engine.write.liquidatePosition([b.address, tusd.address, b.address, 1n, 1n], { account: b }), engine, "AccessControlUnauthorizedAccount");
    await f.viem.assertions.revertWithCustomError(
      oracle.write.setPrice([tusd.address, 1n, 8], { account: b }), oracle, "AccessControlUnauthorizedAccount");
    await f.viem.assertions.revertWithCustomError(
      engine.write.pause({ account: b }), engine, "AccessControlUnauthorizedAccount");
  });

  it("LP cannot withdraw lent-out funds", async () => {
    const { lp, pool, musd } = f;
    const idle = await pool.read.getAvailableLiquidity();
    const lent = await pool.read.getTotalOutstandingDebt();
    assert.ok(lent > 0n);
    await f.viem.assertions.revertWithCustomError(
      pool.write.withdrawLiquidity([idle + 1n, lp.account.address], { account: lp.account }), pool, "InsufficientLiquidity");
    await pool.write.withdrawLiquidity([idle, lp.account.address], { account: lp.account });
    assert.equal(await pool.read.getAvailableLiquidity(), 0n);
    assert.equal(await musd.read.balanceOf([pool.address]), 0n);
    assert.equal(await pool.read.getTotalPoolAssets(), lent);
  });

  it("re-entrant token cannot re-enter deposit or withdraw", async () => {
    const { admin, alice, registry, oracle, engine, vault } = f;
    const a = alice.account;
    const rnt = await f.viem.deployContract("ReentrantToken");
    await oracle.write.setPrice([rnt.address, parseUnits("10", 8), 8]);
    await registry.write.addCollateralAsset([rnt.address, oracle.address, 1, 5000, 6000, 1000, parseUnits("100", 18), parseUnits("1000000", 18), 1n], { account: admin.account });
    await rnt.write.mint([a.address, parseUnits("100", 18)]);
    await rnt.write.approve([engine.address, MAX_UINT], { account: a });
    await rnt.write.setAttack([engine.address, 1]);
    await f.viem.assertions.revertWithCustomError(
      engine.write.addCollateral([rnt.address, parseUnits("10", 18)], { account: a }), engine, "ReentrancyGuardReentrantCall");
    await rnt.write.setAttack([engine.address, 0]);
    await engine.write.addCollateral([rnt.address, parseUnits("10", 18)], { account: a });
    await rnt.write.setAttack([engine.address, 2]);
    await f.viem.assertions.revertWithCustomError(
      engine.write.withdrawCollateral([rnt.address, parseUnits("5", 18), a.address], { account: a }), engine, "ReentrancyGuardReentrantCall");
    assert.equal(await vault.read.getCollateralBalance([a.address, rnt.address]), parseUnits("10", 18));
    assert.equal(await rnt.read.balanceOf([vault.address]), parseUnits("10", 18));
  });
});
