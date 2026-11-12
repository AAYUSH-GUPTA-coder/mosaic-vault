/** Shared tuple components, named exactly as in docs/CONTRACTS.md. */
export const collateralConfigComponents = [
  { name: "token", type: "address" },
  { name: "oracle", type: "address" },
  { name: "decimals", type: "uint8" },
  { name: "maxLtvBps", type: "uint16" },
  { name: "liquidationThresholdBps", type: "uint16" },
  { name: "liquidationPenaltyBps", type: "uint16" },
  { name: "borrowCap", type: "uint256" },
  { name: "maxExposure", type: "uint256" },
  { name: "minDeposit", type: "uint256" },
  { name: "status", type: "uint8" },
  { name: "kind", type: "uint8" },
  { name: "lastUpdated", type: "uint64" },
] as const;

export const positionComponents = [
  { name: "collateral", type: "uint256" },
  { name: "debt", type: "uint256" },
  { name: "lastUpdated", type: "uint64" },
] as const;

export const positionViewComponents = [
  { name: "collateral", type: "uint256" },
  { name: "debt", type: "uint256" },
  { name: "collateralValueUsd", type: "uint256" },
  { name: "maxDebtUsd", type: "uint256" },
  { name: "availableToBorrow", type: "uint256" },
  { name: "healthFactor", type: "uint256" },
  { name: "liquidationPrice", type: "uint256" },
  { name: "currentLtvBps", type: "uint256" },
  { name: "price", type: "uint256" },
  { name: "priceUpdatedAt", type: "uint256" },
  { name: "priceValid", type: "bool" },
] as const;

export const priceDataComponents = [
  { name: "price", type: "uint256" },
  { name: "decimals", type: "uint8" },
  { name: "updatedAt", type: "uint256" },
  { name: "valid", type: "bool" },
] as const;

/** OpenZeppelin v5 AccessControl surface used by the UI. */
export const accessControlAbi = [
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getRoleAdmin",
    stateMutability: "view",
    inputs: [{ name: "role", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "grantRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeRole",
    stateMutability: "nonpayable",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "DEFAULT_ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "RoleGranted",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoleRevoked",
    inputs: [
      { name: "role", type: "bytes32", indexed: true },
      { name: "account", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
    ],
    anonymous: false,
  },
  {
    type: "error",
    name: "AccessControlUnauthorizedAccount",
    inputs: [
      { name: "account", type: "address" },
      { name: "neededRole", type: "bytes32" },
    ],
  },
  { type: "error", name: "AccessControlBadConfirmation", inputs: [] },
] as const;

export const oracleAdapterAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getPriceDecimals",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isPriceValid",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getPriceData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: priceDataComponents }],
  },
  { type: "error", name: "OraclePriceInvalid", inputs: [{ name: "asset", type: "address" }] },
] as const;
