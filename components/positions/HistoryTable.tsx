"use client";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ExplorerLink } from "@/components/transactions/ExplorerLink";
import { formatTokenAmount, formatUsd18, shortAddress } from "@/lib/blockchain/formatters";
import { formatDateTime } from "@/lib/formatting/time";
import type { MosaicAsset, TxHistoryItem } from "@/types/mosaic";

const LABEL: Record<string, string> = {
  PositionOpened: "Position opened",
  CollateralAdded: "Collateral added",
  CollateralWithdrawn: "Collateral withdrawn",
  Borrowed: "Borrowed",
  Repaid: "Repaid",
  PositionLiquidated: "Liquidated",
  Liquidation: "Liquidated",
  LiquidityDeposited: "Liquidity deposited",
  LiquidityWithdrawn: "Liquidity withdrawn",
  Other: "Event",
};

function amountText(item: TxHistoryItem, asset?: MosaicAsset): string {
  if (item.amount === null) return "--";
  if (item.kind === "Borrowed" || item.kind === "Repaid" || item.kind === "PositionLiquidated" || item.kind === "Liquidation") return formatUsd18(item.amount);
  if (asset) return `${formatTokenAmount(item.amount, asset.decimals)} ${asset.symbol}`;
  return item.amount.toString();
}

export function HistoryTable({ items, loading, assets, source }: { items: TxHistoryItem[]; loading: boolean; assets: MosaicAsset[]; source?: "api" | "rpc" }) {
  const byAddr = new Map(assets.map((a) => [a.address.toLowerCase(), a]));
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs font-medium text-muted-foreground">Event</TableHead>
            <TableHead className="text-xs font-medium text-muted-foreground">Asset</TableHead>
            <TableHead className="text-right text-xs font-medium text-muted-foreground">Amount</TableHead>
            <TableHead className="text-right text-xs font-medium text-muted-foreground">When</TableHead>
            <TableHead className="text-right text-xs font-medium text-muted-foreground">Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : items.map((it) => {
                const asset = it.asset ? byAddr.get(it.asset.toLowerCase()) : undefined;
                return (
                  <TableRow key={it.id} className="h-11">
                    <TableCell className="text-sm">{LABEL[it.kind] ?? it.kind}</TableCell>
                    <TableCell className="text-sm">{asset ? asset.symbol : it.asset ? shortAddress(it.asset) : "--"}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{amountText(it, asset)}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">{it.timestamp ? formatDateTime(it.timestamp) : `block ${it.blockNumber.toString()}`}</TableCell>
                    <TableCell className="text-right">
                      <ExplorerLink kind="tx" value={it.txHash} />
                    </TableCell>
                  </TableRow>
                );
              })}
          {!loading && items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No activity yet for this wallet. Your deposits, borrows and repayments will show here.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
      {source ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {source === "api" ? "From the indexed event log." : "Read directly from the chain (indexer not configured)."}
        </p>
      ) : null}
    </div>
  );
}
