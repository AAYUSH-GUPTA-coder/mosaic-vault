/**
 * Testnet only: refreshes tWBTC/tUSD test prices and extends their max staleness (default 30 days),
 * so the live demo keeps working after the deployer's spare gas is refunded.
 *   npx hardhat run scripts/extend-test-prices.ts --network mezoTestnet   (env TEST_PRICE_MAX_AGE_DAYS)
 */
import { network } from "hardhat";
import type { Hash } from "viem";
import { loadDeployment, txLink } from "./lib/common.js";

async function main() {
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const chainId = await pc.getChainId();
  const d = loadDeployment(chainId);
  if (!d) throw new Error("run deploy.ts first");
  const oracle = await viem.getContractAt("TestPriceOracle", d.contracts.TestPriceOracle);
  const age = BigInt(Number(process.env.TEST_PRICE_MAX_AGE_DAYS ?? "30") * 86400);
  const wait = async (label: string, p: Promise<Hash>) => {
    const hash = await p;
    await pc.waitForTransactionReceipt({ hash });
    console.log(`  tx ${label}: ${txLink(hash, chainId)}`);
  };
  for (const [sym, asset] of [["tWBTC", d.tokens.tWBTC], ["tUSD", d.tokens.tUSD]] as const) {
    const pd = await oracle.read.getPriceData([asset]);
    await wait(`${sym} refresh price`, oracle.write.setPrice([asset, pd.price, pd.decimals]));
    await wait(`${sym} max staleness ${age / 86400n}d`, oracle.write.setMaxStaleness([asset, age]));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
