"use client";
import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { readPositionView } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";
import { useMosaicAssets } from "./useMosaicAssets";
import type { MosaicAsset, PositionView } from "@/types/mosaic";

export interface PortfolioEntry {
  asset: MosaicAsset;
  position: PositionView;
}

/** Every registered asset's position for the connected wallet, plus totals (bigint). */
export function usePortfolio() {
  const client = usePublicClient();
  const { address } = useAccount();
  const assetsQuery = useMosaicAssets();
  const assets = assetsQuery.assets;

  const query = useQuery({
    queryKey: [...qk.portfolio(address), assets.map((a) => a.address).join(",")],
    queryFn: async (): Promise<PortfolioEntry[]> => {
      const views = await Promise.all(assets.map((a) => readPositionView(client!, address!, a.address)));
      return assets.map((asset, i) => ({ asset, position: views[i] }));
    },
    enabled: Boolean(client && address) && assets.length > 0,
    refetchInterval: 15_000,
  });

  const entries = query.data ?? [];
  const open = entries.filter((e) => e.position.collateral > 0n || e.position.debt > 0n);
  const totals = open.reduce(
    (acc, e) => {
      acc.collateralUsd += e.position.collateralValueUsd;
      acc.debt += e.position.debt;
      acc.maxDebtUsd += e.position.maxDebtUsd;
      acc.availableToBorrow += e.position.availableToBorrow;
      return acc;
    },
    { collateralUsd: 0n, debt: 0n, maxDebtUsd: 0n, availableToBorrow: 0n },
  );

  return {
    entries,
    open,
    totals,
    isLoading: assetsQuery.isLoading || (query.isLoading && assets.length > 0),
    isError: assetsQuery.isError || query.isError,
    deployed: assetsQuery.deployed,
    wallet: address,
    refetch: query.refetch,
  };
}
