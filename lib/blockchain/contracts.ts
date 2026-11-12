import type { Address } from "viem";
import { mosaicConfig } from "./config";
import {
  chainlinkFeedOracleAdapterAbi,
  collateralRegistryAbi,
  collateralVaultAbi,
  erc20Abi,
  mosaicLendingEngineAbi,
  mosaicLendingPoolAbi,
  mosaicLiquidationEngineAbi,
  testCollateralTokenAbi,
  testPriceOracleAbi,
} from "./abis";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const a = mosaicConfig.addresses;

/**
 * Typed `{ address, abi }` objects for wagmi/viem calls.
 * Addresses fall back to the zero address when undeployed; callers gate on `isDeployed()`.
 */
export const contracts = {
  registry: { address: (a.registry || ZERO) as Address, abi: collateralRegistryAbi },
  vault: { address: (a.vault || ZERO) as Address, abi: collateralVaultAbi },
  pool: { address: (a.pool || ZERO) as Address, abi: mosaicLendingPoolAbi },
  engine: { address: (a.engine || ZERO) as Address, abi: mosaicLendingEngineAbi },
  liquidationEngine: {
    address: (a.liquidationEngine || ZERO) as Address,
    abi: mosaicLiquidationEngineAbi,
  },
  oracle: { address: (a.oracle || ZERO) as Address, abi: chainlinkFeedOracleAdapterAbi },
  testOracle: { address: (a.testOracle || ZERO) as Address, abi: testPriceOracleAbi },
  musd: { address: a.musd, abi: erc20Abi },
} as const;

export const erc20 = (address: Address) => ({ address, abi: erc20Abi }) as const;
export const testToken = (address: Address) => ({ address, abi: testCollateralTokenAbi }) as const;
export const testOracleAt = (address: Address) => ({ address, abi: testPriceOracleAbi }) as const;
export const ZERO_ADDRESS = ZERO;
