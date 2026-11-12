"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { isDeployed } from "@/lib/blockchain/config";
import { fetchOpenedPositions } from "@/lib/blockchain/events";
import { readIsLiquidatable, readPositionView } from "@/lib/blockchain/reads";
import { qk } from "@/lib/blockchain/queryKeys";
import type { PositionView } from "@/types/mosaic";

export interface ScannedPosition {
  user: Address;
  asset: Address;
  liquidatable: boolean;
  view: PositionView;
}

interface ApiRow {
  wallet_address: string;
  asset_address: string;
}

/** Candidate (user, asset) pairs from PositionOpened via /api/events, else getLogs; then isLiquidatable each. */
export function useLiquidatableScan(enabled = true) {
  const client = usePublicClient();
  const query = useQuery({
    queryKey: qk.liquidatable(),
    queryFn: async (): Promise<{ scanned: ScannedPosition[]; source: "api" | "rpc" }> => {
      let pairs: Array<{ user: Address; asset: Address }> = [];
      let source: "api" | "rpc" = "rpc";
      try {
        const res = await fetch(`/api/events?limit=500`, { cache: "no-store" });
        if (res.ok) {
          const json = (await res.json()) as { ok: boolean; source?: string; data?: Array<ApiRow & { event_name: string }> };
          if (json.ok && json.source !== "unconfigured" && Array.isArray(json.data)) {
            const seen = new Set<string>();
            for (const r of json.data) {
              if (r.event_name !== "PositionOpened" || !r.wallet_address || !r.asset_address) continue;
              const key = `${r.wallet_address}:${r.asset_address}`.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              pairs.push({ user: r.wallet_address as Address, asset: r.asset_address as Address });
            }
            source = "api";
          }
        }
      } catch {
        // fall back to RPC
      }
      if (source === "rpc") pairs = await fetchOpenedPositions(client!);
      const scanned = await Promise.all(
        pairs.map(async ({ user, asset }) => {
          const [liquidatable, view] = await Promise.all([readIsLiquidatable(client!, user, asset), readPositionView(client!, user, asset)]);
          return { user, asset, liquidatable, view };
        }),
      );
      // Only positions that still carry debt are interesting.
      return { scanned: scanned.filter((s) => s.view.debt > 0n), source };
    },
    enabled: Boolean(client) && isDeployed() && enabled,
    staleTime: 30_000,
  });
  return { ...query, scanned: query.data?.scanned ?? [], source: query.data?.source };
}
