import { keccak256, toBytes, type Hex } from "viem";

/** OpenZeppelin AccessControl role ids = keccak256(name). DEFAULT_ADMIN_ROLE = 0x00. */
export const ROLES = {
  DEFAULT_ADMIN_ROLE: `0x${"0".repeat(64)}` as Hex,
  RISK_MANAGER_ROLE: keccak256(toBytes("RISK_MANAGER_ROLE")),
  ENGINE_ROLE: keccak256(toBytes("ENGINE_ROLE")),
  LIQUIDITY_PROVIDER_ROLE: keccak256(toBytes("LIQUIDITY_PROVIDER_ROLE")),
  PAUSER_ROLE: keccak256(toBytes("PAUSER_ROLE")),
  LIQUIDATION_ENGINE_ROLE: keccak256(toBytes("LIQUIDATION_ENGINE_ROLE")),
  ORACLE_MANAGER_ROLE: keccak256(toBytes("ORACLE_MANAGER_ROLE")),
} as const;

export type RoleName = keyof typeof ROLES;
