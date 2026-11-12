"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { isDeployed } from "@/lib/blockchain/config";
import { readMosaicAssets } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";
import type { MosaicAsset } from "@/types/mosaic";

/** Registry list + configs + oracle prices + exposure. Refetches every 15s. */
export function useMosaicAssets() {
  const client = usePublicClient();
  const deployed = isDeployed();
  const query = useQuery({
    queryKey: qk.assets(),
    queryFn: () => readMosaicAssets(client!),
    enabled: Boolean(client) && deployed,
    refetchInterval: 15_000,
  });
  return { ...query, assets: query.data ?? [], deployed };
}

export function useMosaicAsset(address?: Address | string): { asset: MosaicAsset | undefined; isLoading: boolean; deployed: boolean; isError: boolean } {
  const { assets, isLoading, deployed, isError } = useMosaicAssets();
  const asset = address ? assets.find((a) => a.address.toLowerCase() === address.toLowerCase()) : undefined;
  return { asset, isLoading, deployed, isError };
}
