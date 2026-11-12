import type { HardhatUserConfig } from "hardhat/config";
import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable } from "hardhat/config";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Hardhat 3 resolves configVariable() from process.env only; load contracts/.env when present (Node >= 20.12).
try {
  const envPath = fileURLToPath(new URL("./.env", import.meta.url));
  if (existsSync(envPath) && typeof process.loadEnvFile === "function") process.loadEnvFile(envPath);
} catch {
  // ignore: a missing or malformed .env must not break compilation/tests
}

const config: HardhatUserConfig = {
  plugins: [hardhatToolboxViem],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "london",
        },
      },
    },
  },
  networks: {
    hardhatMainnet: { type: "edr-simulated", chainType: "l1" },
    // persistent local node for dry-running the deploy/fund/demo scripts: `npx hardhat node`
    localhost: { type: "http", chainType: "l1", url: "http://127.0.0.1:8545" },
    mezoTestnet: {
      type: "http",
      chainType: "l1",
      url: "https://rpc.test.mezo.org",
      chainId: 31611,
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
      // Mezo nodes under-estimate gas for calls with internal try/catch; pad every estimate.
      gasMultiplier: 1.5,
    },
  },
  test: {
    solidity: {
      fuzz: { runs: 256 },
      invariant: { runs: 256, depth: 32 },
    },
  },
};

export default config;
