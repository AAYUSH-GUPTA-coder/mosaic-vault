import { defineChain } from "viem";

const rpcUrl =
  process.env.NEXT_PUBLIC_MEZO_RPC_URL?.trim() || "https://rpc.test.mezo.org";
const explorerUrl =
  process.env.NEXT_PUBLIC_EXPLORER_URL?.trim() || "https://explorer.test.mezo.org";

export const MEZO_TESTNET_CHAIN_ID = 31611 as const;

/** Mezo Testnet, verified 2026-11-06 (docs/ARCHITECTURE.md). Gas is native BTC (18 dec). */
export const mezoTestnet = defineChain({
  id: MEZO_TESTNET_CHAIN_ID,
  name: "Mezo Testnet",
  nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
  rpcUrls: {
    default: { http: [rpcUrl] },
  },
  blockExplorers: {
    default: { name: "Mezo Testnet Explorer", url: explorerUrl },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
      blockCreated: 3328573,
    },
  },
  testnet: true,
});

export type MezoTestnet = typeof mezoTestnet;
