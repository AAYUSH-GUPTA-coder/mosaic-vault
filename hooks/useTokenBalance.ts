"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import type { Address } from "viem";
import { readTokenBalance } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";

/** ERC-20 balance of the connected wallet (BTC precompile mirrors the native balance). */
export function useTokenBalance(token?: Address, owner?: Address) {
  const client = usePublicClient();
  const { address } = useAccount();
  const who = owner ?? address;
  const query = useQuery({
    queryKey: qk.balance(token, who),
    queryFn: () => readTokenBalance(client!, token!, who!),
    enabled: Boolean(client && token && who),
    refetchInterval: 15_000,
  });
  return { ...query, balance: query.data };
}
