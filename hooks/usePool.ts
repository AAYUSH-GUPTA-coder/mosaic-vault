"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { isDeployed } from "@/lib/blockchain/config";
import { readPool } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";

export function usePool() {
  const client = usePublicClient();
  const query = useQuery({
    queryKey: qk.pool(),
    queryFn: () => readPool(client!),
    enabled: Boolean(client) && isDeployed(),
    refetchInterval: 15_000,
  });
  return { ...query, pool: query.data };
}
