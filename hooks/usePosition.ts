"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { isDeployed } from "@/lib/blockchain/config";
import { readPositionView } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";

/** getPositionView for the connected wallet and one asset. */
export function usePosition(asset?: Address) {
  const client = usePublicClient();
  const { address } = useAccount();
  const query = useQuery({
    queryKey: qk.position(address, asset),
    queryFn: () => readPositionView(client!, address!, asset!),
    enabled: Boolean(client && address && asset) && isDeployed(),
    refetchInterval: 15_000,
  });
  return { ...query, position: query.data, wallet: address };
}
