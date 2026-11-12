"use client";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address, Hash } from "viem";
import { isDeployed } from "@/lib/blockchain/config";
import { fetchEngineHistory } from "@/lib/blockchain/events";
import { qk } from "@/lib/blockchain/queryKeys";
import type { TxHistoryItem, TxHistoryKind } from "@/types/mosaic";

interface ApiEventRow {
  transaction_hash: string;
  block_number: number | string;
  log_index: number;
  event_name: string;
  event_payload: Record<string, unknown> | null;
  wallet_address: string | null;
  asset_address: string | null;
  block_timestamp: string | null;
}

interface ApiResponse {
  ok: boolean;
  data?: ApiEventRow[];
  source?: "supabase" | "unconfigured" | "static";
  error?: { code: string; message: string };
}

const KINDS: TxHistoryKind[] = ["PositionOpened", "CollateralAdded", "CollateralWithdrawn", "Borrowed", "Repaid", "PositionLiquidated", "Liquidation", "LiquidityDeposited", "LiquidityWithdrawn"];

function big(v: unknown): bigint | null {
  if (typeof v === "bigint") return v;
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return null;
}

function fromApi(row: ApiEventRow): TxHistoryItem {
  const p = row.event_payload ?? {};
  const kind = (KINDS.includes(row.event_name as TxHistoryKind) ? row.event_name : "Other") as TxHistoryKind;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = big(p[k]);
      if (v !== null) return v;
    }
    return null;
  };
  return {
    id: `${row.transaction_hash}:${row.log_index}`,
    kind,
    txHash: row.transaction_hash as Hash,
    blockNumber: big(row.block_number) ?? 0n,
    logIndex: row.log_index,
    timestamp: row.block_timestamp ? Math.floor(new Date(row.block_timestamp).getTime() / 1000) : null,
    wallet: (row.wallet_address as Address | null) ?? null,
    asset: (row.asset_address as Address | null) ?? null,
    amount: pick("amount", "debtRepaid"),
    secondary: pick("newCollateral", "newDebt", "collateralSeized"),
    source: "api",
  };
}

/**
 * Reads history from the chain first (contract events are the source of truth and always current;
 * the Supabase index is refreshed by a daily cron on the Hobby plan). Falls back to GET /api/events
 * when the RPC read fails.
 */
export function useTxHistory(wallet?: Address, asset?: Address, limit = 50) {
  const client = usePublicClient();
  const query = useQuery({
    queryKey: [...qk.history(wallet, asset), limit],
    queryFn: async (): Promise<{ items: TxHistoryItem[]; source: "api" | "rpc" }> => {
      if (client) {
        try {
          const items = await fetchEngineHistory(client, { wallet, asset, withTimestamps: true });
          return { items: items.slice(0, limit), source: "rpc" };
        } catch {
          // fall through to the index
        }
      }
      const params = new URLSearchParams();
      if (wallet) params.set("wallet", wallet);
      if (asset) params.set("asset", asset);
      params.set("limit", String(limit));
      const res = await fetch(`/api/events?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Transaction history is unavailable right now.");
      const json = (await res.json()) as ApiResponse;
      if (json.ok && Array.isArray(json.data)) return { items: json.data.map(fromApi), source: "api" };
      return { items: [], source: "api" };
    },
    enabled: Boolean(wallet) && isDeployed(),
    staleTime: 30_000,
  });
  return { ...query, items: query.data?.items ?? [], source: query.data?.source };
}
