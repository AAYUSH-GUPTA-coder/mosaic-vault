"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { readAllowance } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";

export function useAllowance(token?: Address, spender?: Address) {
  const client = usePublicClient();
  const { address } = useAccount();
  const query = useQuery({
    queryKey: qk.allowance(token, address, spender),
    queryFn: () => readAllowance(client!, token!, address!, spender!),
    enabled: Boolean(client && token && address && spender),
  });
  return { ...query, allowance: query.data };
}
