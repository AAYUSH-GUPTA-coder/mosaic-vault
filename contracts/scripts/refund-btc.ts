/**
 * Sends the deployer's leftover native testnet BTC back to REFUND_TO, keeping enough for the transfer's gas.
 *   REFUND_TO=0x... npx hardhat run scripts/refund-btc.ts --network mezoTestnet
 */
import { network } from "hardhat";
import { getAddress } from "viem";
import { txLink } from "./lib/common.js";

async function main() {
  const to = process.env.REFUND_TO;
  if (!to) throw new Error("set REFUND_TO");
  const { viem } = await network.connect();
  const pc = await viem.getPublicClient();
  const [wallet] = await viem.getWalletClients();
  const chainId = await pc.getChainId();
  const bal = await pc.getBalance({ address: wallet.account.address });
  const gasPrice = await pc.getGasPrice();
  const gas = 21_000n;
  const fee = (gas * gasPrice * 3n); // generous margin for price moves
  if (bal <= fee) { console.log("nothing to refund"); return; }
  const value = bal - fee;
  const hash = await wallet.sendTransaction({ to: getAddress(to), value, gas, gasPrice: gasPrice * 2n });
  await pc.waitForTransactionReceipt({ hash });
  console.log(`  refunded ${Number(value) / 1e18} BTC to ${to}: ${txLink(hash, chainId)}`);
  console.log(`  deployer left with ${Number(await pc.getBalance({ address: wallet.account.address })) / 1e18} BTC`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
