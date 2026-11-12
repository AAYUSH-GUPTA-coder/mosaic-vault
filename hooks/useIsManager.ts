"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { contracts } from "@/lib/blockchain/contracts";
import { isDeployed, mosaicConfig } from "@/lib/blockchain/config";
import { readHasRole } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";

export interface ManagerRoles {
  riskManager: boolean;
  liquidityProvider: boolean;
  pauser: boolean;
  oracleManager: boolean;
}

/** hasRole(RISK_MANAGER_ROLE) on the registry, plus the sibling roles the manager pages use. */
export function useIsManager() {
  const client = usePublicClient();
  const { address } = useAccount();
  const query = useQuery({
    queryKey: qk.roles(address),
    queryFn: async (): Promise<ManagerRoles> => {
      const [riskManager, liquidityProvider, pauser, oracleManager] = await Promise.all([
        readHasRole(client!, contracts.registry.address, "RISK_MANAGER_ROLE", address!),
        readHasRole(client!, contracts.pool.address, "LIQUIDITY_PROVIDER_ROLE", address!),
        readHasRole(client!, contracts.engine.address, "PAUSER_ROLE", address!),
        mosaicConfig.addresses.testOracle
          ? readHasRole(client!, mosaicConfig.addresses.testOracle, "ORACLE_MANAGER_ROLE", address!)
          : Promise.resolve(false),
      ]);
      return { riskManager, liquidityProvider, pauser, oracleManager };
    },
    enabled: Boolean(client && address) && isDeployed(),
    staleTime: 60_000,
  });
  return {
    isManager: query.data?.riskManager ?? false,
    roles: query.data ?? { riskManager: false, liquidityProvider: false, pauser: false, oracleManager: false },
    isLoading: query.isLoading,
    wallet: address,
  };
}
