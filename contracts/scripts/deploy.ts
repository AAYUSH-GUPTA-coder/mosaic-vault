/**
 * Deploys the Mosaic Vault stack following docs/CONTRACTS.md "Deployment order":
 * Registry -> ChainlinkFeedOracleAdapter -> TestPriceOracle -> Pool -> Vault -> Engine -> LiquidationEngine
 * -> test tokens -> roles -> feeds -> register assets. Pool funding is scripts/fund-pool.ts.
 *
 *   npx hardhat run scripts/deploy.ts --network mezoTestnet
 *
 * Idempotent-ish: if deployments/<chain>.json exists, contracts that still have code at the recorded
 * address are reused (set REDEPLOY=1 to force fresh deployments). Roles, feeds and registrations are
 * checked before being (re)applied. On a non-Mezo chain (local dry run) mocks replace the precompiles.
 */
import { network } from "hardhat";
import { parseAbi, type Address, type Hash } from "viem";
import {
  MEZO, MEZO_CHAIN_ID, PARAMS, ROLES, type Deployment, loadDeployment, saveDeployment, txLink, addressLink, withRetry, step,
} from "./lib/common.js";

const aggregatorAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
]);

async function main() {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer] = await viem.getWalletClients();
  const chainId = await withRetry("chainId", () => publicClient.getChainId());
  const isMezo = chainId === MEZO_CHAIN_ID;
  const admin = deployer.account.address;
  const txs: Record<string, Hash> = {};
  const redeploy = process.env.REDEPLOY === "1";
  const prev = redeploy ? undefined : loadDeployment(chainId);

  step(`Deployer ${admin} on chain ${chainId}${isMezo ? " (Mezo testnet)" : " (local dry run: mocks replace precompiles)"}`);
  const bal = await withRetry("balance", () => publicClient.getBalance({ address: admin }));
  console.log(`  gas balance: ${bal} wei BTC`);
  if (bal === 0n) throw new Error("deployer has no BTC for gas");

  async function wait(label: string, hashP: Promise<Hash>): Promise<Hash> {
    const hash = await hashP;
    const r = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    txs[label] = hash;
    console.log(`  ${label}: ${txLink(hash, chainId)}`);
    return hash;
  }

  async function deployOrReuse<N extends string>(name: N, key: string, args: unknown[], prevAddr?: Address): Promise<Address> {
    if (prevAddr) {
      const code = await withRetry(`getCode ${name}`, () => publicClient.getCode({ address: prevAddr }));
      if (code && code !== "0x") {
        console.log(`  reuse ${name} at ${addressLink(prevAddr, chainId)}`);
        return prevAddr;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { contract, deploymentTransaction } = (await viem.sendDeploymentTransaction(name as any, args as any)) as unknown as {
      contract: { address: Address };
      deploymentTransaction: { hash: Hash };
    };
    await wait(`deploy:${key}`, Promise.resolve(deploymentTransaction.hash));
    console.log(`  ${name} -> ${addressLink(contract.address, chainId)}`);
    return contract.address;
  }

  // ---------------------------------------------------------------- external deps (real on Mezo, mocks locally)
  step("External dependencies");
  let musd = MEZO.MUSD;
  let btc = MEZO.BTC;
  let btcFeed = MEZO.BTC_USD_FEED;
  if (!isMezo) {
    musd = await deployOrReuse("MockERC20", "MockMUSD", ["Mezo USD (mock)", "MUSD", 18], prev?.tokens.MUSD);
    btc = await deployOrReuse("MockERC20", "MockBTC", ["BTC (mock)", "BTC", 18], prev?.tokens.BTC);
    btcFeed = await deployOrReuse("MockAggregatorV3", "MockBtcFeed", [18], prev?.feeds.BTC);
    const feed = await viem.getContractAt("MockAggregatorV3", btcFeed);
    const now = BigInt((await publicClient.getBlock()).timestamp);
    await wait("mock:setBtcAnswer", feed.write.setAnswer([75_000n * 10n ** 18n, now]));
  }
  for (const [n, a] of Object.entries({ MUSD: musd, BTC: btc, "BTC/USD feed": btcFeed })) {
    const code = await withRetry(`getCode ${n}`, () => publicClient.getCode({ address: a }));
    if (!code || code === "0x") throw new Error(`${n} has no code at ${a}`);
    console.log(`  ${n}: ${a} (code ok)`);
  }

  // ---------------------------------------------------------------- core contracts (deploy order)
  step("Core contracts");
  const registryAddr = await deployOrReuse("CollateralRegistry", "CollateralRegistry", [admin], prev?.contracts.CollateralRegistry);
  const feedAdapterAddr = await deployOrReuse("ChainlinkFeedOracleAdapter", "ChainlinkFeedOracleAdapter", [admin], prev?.contracts.ChainlinkFeedOracleAdapter);
  const testOracleAddr = await deployOrReuse("TestPriceOracle", "TestPriceOracle", [admin], prev?.contracts.TestPriceOracle);
  const poolAddr = await deployOrReuse("MosaicLendingPool", "MosaicLendingPool", [musd, admin], prev?.contracts.MosaicLendingPool);
  const vaultAddr = await deployOrReuse("CollateralVault", "CollateralVault", [admin], prev?.contracts.CollateralVault);
  const engineAddr = await deployOrReuse("MosaicLendingEngine", "MosaicLendingEngine", [registryAddr, vaultAddr, poolAddr, musd, admin], prev?.contracts.MosaicLendingEngine);
  const liqAddr = await deployOrReuse("MosaicLiquidationEngine", "MosaicLiquidationEngine", [engineAddr, registryAddr, musd], prev?.contracts.MosaicLiquidationEngine);

  step("Test-only collateral tokens");
  const twbtcAddr = await deployOrReuse("TestCollateralToken", "tWBTC", ["Mosaic Test Wrapped BTC (test-only)", "tWBTC", 8, 10n * 10n ** 8n], prev?.tokens.tWBTC);
  const tusdAddr = await deployOrReuse("TestCollateralToken", "tUSD", ["Mosaic Test Stablecoin (test-only)", "tUSD", 6, 100_000n * 10n ** 6n], prev?.tokens.tUSD);

  const registry = await viem.getContractAt("CollateralRegistry", registryAddr);
  const feedAdapter = await viem.getContractAt("ChainlinkFeedOracleAdapter", feedAdapterAddr);
  const testOracle = await viem.getContractAt("TestPriceOracle", testOracleAddr);
  const pool = await viem.getContractAt("MosaicLendingPool", poolAddr);
  const vault = await viem.getContractAt("CollateralVault", vaultAddr);
  const engine = await viem.getContractAt("MosaicLendingEngine", engineAddr);

  // ---------------------------------------------------------------- roles
  step("Roles");
  type RoleContract = {
    read: { hasRole: (args: readonly [Hash, Address]) => Promise<boolean> };
    write: { grantRole: (args: readonly [Hash, Address]) => Promise<Hash> };
  };
  type RoleTarget = { c: RoleContract; name: string };
  async function ensureRole(t: RoleTarget, role: Hash, roleName: string, account: Address) {
    const has = await withRetry(`hasRole ${t.name}.${roleName}`, () => t.c.read.hasRole([role, account]));
    if (has) {
      console.log(`  ${t.name}.${roleName} already granted to ${account}`);
      return;
    }
    await wait(`role:${t.name}.${roleName}`, t.c.write.grantRole([role, account]));
  }
  await ensureRole({ c: vault as unknown as RoleContract, name: "CollateralVault" }, ROLES.ENGINE_ROLE, "ENGINE_ROLE", engineAddr);
  await ensureRole({ c: pool as unknown as RoleContract, name: "MosaicLendingPool" }, ROLES.ENGINE_ROLE, "ENGINE_ROLE", engineAddr);
  await ensureRole({ c: engine as unknown as RoleContract, name: "MosaicLendingEngine" }, ROLES.LIQUIDATION_ENGINE_ROLE, "LIQUIDATION_ENGINE_ROLE", liqAddr);
  await ensureRole({ c: registry as unknown as RoleContract, name: "CollateralRegistry" }, ROLES.RISK_MANAGER_ROLE, "RISK_MANAGER_ROLE", admin);
  await ensureRole({ c: pool as unknown as RoleContract, name: "MosaicLendingPool" }, ROLES.LIQUIDITY_PROVIDER_ROLE, "LIQUIDITY_PROVIDER_ROLE", admin);
  await ensureRole({ c: engine as unknown as RoleContract, name: "MosaicLendingEngine" }, ROLES.PAUSER_ROLE, "PAUSER_ROLE", admin);
  await ensureRole({ c: feedAdapter as unknown as RoleContract, name: "ChainlinkFeedOracleAdapter" }, ROLES.ORACLE_MANAGER_ROLE, "ORACLE_MANAGER_ROLE", admin);
  await ensureRole({ c: testOracle as unknown as RoleContract, name: "TestPriceOracle" }, ROLES.ORACLE_MANAGER_ROLE, "ORACLE_MANAGER_ROLE", admin);

  // ---------------------------------------------------------------- feeds and test prices
  step("Oracle feeds");
  const [curAgg] = await withRetry("feeds(BTC)", () => feedAdapter.read.feeds([btc]));
  if (curAgg.toLowerCase() !== btcFeed.toLowerCase()) {
    await wait("feed:setFeed:BTC", feedAdapter.write.setFeed([btc, btcFeed, 900n]));
  } else {
    console.log("  BTC feed already set");
  }
  const feedDecimals = await withRetry("feed decimals", () => publicClient.readContract({ address: btcFeed, abi: aggregatorAbi, functionName: "decimals" }));
  const [, answer, , updatedAt] = await withRetry("latestRoundData", () => publicClient.readContract({ address: btcFeed, abi: aggregatorAbi, functionName: "latestRoundData" }));
  if (answer <= 0n) throw new Error(`BTC feed answer not positive: ${answer}`);
  const btcPrice8 = feedDecimals >= 8 ? answer / 10n ** BigInt(feedDecimals - 8) : answer * 10n ** BigInt(8 - feedDecimals);
  console.log(`  live BTC/USD = ${answer} (${feedDecimals} dec, updatedAt ${updatedAt}) -> tWBTC seed ${btcPrice8} (8 dec)`);
  const btcValid = await withRetry("isPriceValid(BTC)", () => feedAdapter.read.isPriceValid([btc]));
  if (!btcValid) throw new Error("ChainlinkFeedOracleAdapter reports BTC price invalid; registration would fail");

  await wait("oracle:setPrice:tWBTC", testOracle.write.setPrice([twbtcAddr, btcPrice8, 8]));
  await wait("oracle:setPrice:tUSD", testOracle.write.setPrice([tusdAddr, 10n ** 8n, 8]));

  // ---------------------------------------------------------------- register assets
  step("Register collateral assets");
  async function ensureAsset(label: keyof typeof PARAMS, token: Address, oracle: Address, kind: 0 | 1) {
    const supported = await withRetry(`isSupported ${label}`, () => registry.read.isSupportedCollateral([token]));
    if (supported) {
      console.log(`  ${label} already registered`);
      return;
    }
    const p = PARAMS[label];
    await wait(`registry:add:${label}`, registry.write.addCollateralAsset([token, oracle, kind, p.maxLtv, p.liqThreshold, p.penalty, p.borrowCap, p.maxExposure, p.minDeposit]));
  }
  await ensureAsset("BTC", btc, feedAdapterAddr, 0);
  await ensureAsset("tWBTC", twbtcAddr, testOracleAddr, 1);
  await ensureAsset("tUSD", tusdAddr, testOracleAddr, 1);
  const count = await withRetry("assetCount", () => registry.read.assetCount());
  console.log(`  registry now lists ${count} assets`);

  // ---------------------------------------------------------------- write deployment file
  const deployment: Deployment = {
    chainId,
    deployer: admin,
    deployedAt: new Date().toISOString(),
    contracts: {
      CollateralRegistry: registryAddr,
      ChainlinkFeedOracleAdapter: feedAdapterAddr,
      TestPriceOracle: testOracleAddr,
      MosaicLendingPool: poolAddr,
      CollateralVault: vaultAddr,
      MosaicLendingEngine: engineAddr,
      MosaicLiquidationEngine: liqAddr,
    },
    tokens: { MUSD: musd, BTC: btc, tWBTC: twbtcAddr, tUSD: tusdAddr },
    feeds: { BTC: btcFeed },
    txs: { ...(prev?.txs ?? {}), ...txs },
  };
  const path = saveDeployment(deployment);
  step(`Wrote ${path}`);
  console.log("  next: npx hardhat run scripts/fund-pool.ts --network mezoTestnet");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
