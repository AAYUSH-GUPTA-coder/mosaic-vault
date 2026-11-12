import { createPublicClient, http, keccak256, toHex, type Address, type Hex } from "viem";
import { accessControlAbi } from "@/lib/blockchain/abis";
import { getContractAddresses, getRpcUrl } from "@/lib/database/env";

/**
 * Manager gate: `hasRole(RISK_MANAGER_ROLE, address)` on the CollateralRegistry, cached 60s.
 * Returns false when the registry address is not configured or the RPC call fails.
 */

export const RISK_MANAGER_ROLE: Hex = keccak256(toHex("RISK_MANAGER_ROLE"));
export const MANAGER_CACHE_TTL_MS = 60_000;

export type HasRoleReader = (role: Hex, account: Address) => Promise<boolean>;

interface CacheEntry {
  value: boolean;
  at: number;
}

export interface ManagerChecker {
  isManager(address: string, now?: number): Promise<boolean>;
  clear(): void;
}

export function createManagerChecker(opts: {
  hasRole: HasRoleReader;
  registryConfigured: () => boolean;
  ttlMs?: number;
}): ManagerChecker {
  const cache = new Map<string, CacheEntry>();
  const ttl = opts.ttlMs ?? MANAGER_CACHE_TTL_MS;
  return {
    async isManager(address, now = Date.now()) {
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return false;
      if (!opts.registryConfigured()) return false;
      const key = address.toLowerCase();
      const hit = cache.get(key);
      if (hit && now - hit.at < ttl) return hit.value;
      let value = false;
      try {
        value = await opts.hasRole(RISK_MANAGER_ROLE, key as Address);
      } catch (err) {
        console.warn("[auth] hasRole read failed", err instanceof Error ? err.message : err);
        value = false;
      }
      cache.set(key, { value, at: now });
      return value;
    },
    clear() {
      cache.clear();
    },
  };
}

async function readHasRoleOnChain(role: Hex, account: Address): Promise<boolean> {
  const registry = getContractAddresses().registry;
  if (!registry) return false;
  const client = createPublicClient({ transport: http(getRpcUrl(), { timeout: 10_000 }) });
  return client.readContract({ address: registry, abi: accessControlAbi, functionName: "hasRole", args: [role, account] });
}

const defaultChecker = createManagerChecker({
  hasRole: readHasRoleOnChain,
  registryConfigured: () => getContractAddresses().registry !== null,
});

export function isManager(address: string): Promise<boolean> {
  return defaultChecker.isManager(address);
}

export function clearManagerCache(): void {
  defaultChecker.clear();
}
