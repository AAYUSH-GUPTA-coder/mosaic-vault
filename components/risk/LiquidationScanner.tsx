"use client";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ExplorerLink } from "@/components/transactions/ExplorerLink";
import { HealthBadge } from "@/components/dashboard/HealthBadge";
import { useLiquidatableScan, type ScannedPosition } from "@/hooks/useLiquidatableScan";
import { formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import type { MosaicAsset } from "@/types/mosaic";

/** Scans PositionOpened events (API first, RPC fallback) and checks isLiquidatable for each. */
export function LiquidationScanner({ assets, onPick }: { assets: MosaicAsset[]; onPick?: (p: ScannedPosition) => void }) {
  const { scanned, isLoading, isFetching, refetch, source, isError } = useLiquidatableScan();
  const byAddr = new Map(assets.map((a) => [a.address.toLowerCase(), a]));
  const liquidatable = scanned.filter((s) => s.liquidatable);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isLoading ? "Scanning open positions…" : `${scanned.length} open position${scanned.length === 1 ? "" : "s"} with debt, ${liquidatable.length} liquidatable.`}
          {source ? <span className="ml-1">({source === "api" ? "indexed events" : "chain logs"})</span> : null}
        </p>
        <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Scanning…" : "Rescan"}
        </Button>
      </div>
      {isError ? <p className="text-sm text-health-risk">The scan failed. Check the RPC and try again.</p> : null}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-muted-foreground">Borrower</TableHead>
              <TableHead className="text-xs text-muted-foreground">Asset</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Collateral</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Debt</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Health</TableHead>
              {onPick ? <TableHead className="text-right text-xs text-muted-foreground"></TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 2 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: onPick ? 6 : 5 }).map((__, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}</TableRow>
                ))
              : scanned.map((s) => {
                  const a = byAddr.get(s.asset.toLowerCase());
                  return (
                    <TableRow key={`${s.user}:${s.asset}`} className="h-11">
                      <TableCell><ExplorerLink kind="address" value={s.user} /></TableCell>
                      <TableCell className="text-sm">{a?.symbol ?? s.asset.slice(0, 8)}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{a ? `${formatTokenAmount(s.view.collateral, a.decimals, { compact: true })} ${a.symbol}` : s.view.collateral.toString()}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{formatUsd18(s.view.debt)}</TableCell>
                      <TableCell className="text-right"><HealthBadge hf={s.view.priceValid ? s.view.healthFactor : null} debt={s.view.debt} /></TableCell>
                      {onPick ? (
                        <TableCell className="text-right">
                          <Button size="xs" variant={s.liquidatable ? "default" : "outline"} onClick={() => onPick(s)}>Quote</Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
            {!isLoading && scanned.length === 0 ? (
              <TableRow><TableCell colSpan={onPick ? 6 : 5} className="py-8 text-center text-sm text-muted-foreground">No open positions with debt were found.</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
