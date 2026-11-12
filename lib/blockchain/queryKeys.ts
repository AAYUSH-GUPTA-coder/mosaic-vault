import type { Address } from "viem";

/** Every chain read lives under ["mosaic", ...] so one invalidation refreshes the app after a tx. */
export const qk = {
  all: ["mosaic"] as const,
  assets: () => ["mosaic", "assets"] as const,
  pool: () => ["mosaic", "pool"] as const,
  position: (wallet?: Address, asset?: Address) => ["mosaic", "position", wallet?.toLowerCase(), asset?.toLowerCase()] as const,
  portfolio: (wallet?: Address) => ["mosaic", "portfolio", wallet?.toLowerCase()] as const,
  balance: (token?: Address, owner?: Address) => ["mosaic", "balance", token?.toLowerCase(), owner?.toLowerCase()] as const,
  allowance: (token?: Address, owner?: Address, spender?: Address) =>
    ["mosaic", "allowance", token?.toLowerCase(), owner?.toLowerCase(), spender?.toLowerCase()] as const,
  roles: (wallet?: Address) => ["mosaic", "roles", wallet?.toLowerCase()] as const,
  history: (wallet?: Address, asset?: Address) => ["mosaic", "history", wallet?.toLowerCase(), asset?.toLowerCase()] as const,
  liquidatable: () => ["mosaic", "liquidatable"] as const,
  faucetCap: (token?: Address) => ["mosaic", "faucetCap", token?.toLowerCase()] as const,
};
