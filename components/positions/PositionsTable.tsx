"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetLabel } from "@/components/dashboard/AssetLabel";
import { HealthBadge } from "@/components/dashboard/HealthBadge";
import { formatBps, formatPrice18, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import type { PortfolioEntry } from "@/hooks/usePortfolio";

const HEAD = "sticky top-0 bg-card text-xs font-medium text-muted-foreground";
const NUM = "text-right font-mono tabular-nums";

export function PositionsTable({ entries, loading }: { entries: PortfolioEntry[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={HEAD}>Position</TableHead>
            <TableHead className={`${HEAD} text-right`}>Collateral</TableHead>
            <TableHead className={`${HEAD} text-right`}>Value</TableHead>
            <TableHead className={`${HEAD} text-right`}>Debt</TableHead>
            <TableHead className={`${HEAD} text-right`}>LTV</TableHead>
            <TableHead className={`${HEAD} text-right`}>Liq. price</TableHead>
            <TableHead className={`${HEAD} text-right`}>Health</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 2 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : entries.map(({ asset, position }) => (
                <TableRow key={asset.address} className="h-12">
                  <TableCell>
                    <Link href={`/positions/${asset.address}`} className="hover:underline underline-offset-4">
                      <AssetLabel symbol={asset.symbol} kind={asset.kind} compact />
                    </Link>
                  </TableCell>
                  <TableCell className={NUM}>
                    {formatTokenAmount(position.collateral, asset.decimals, { compact: true })} {asset.symbol}
                  </TableCell>
                  <TableCell className={NUM}>{position.priceValid ? formatUsd18(position.collateralValueUsd) : "No price"}</TableCell>
                  <TableCell className={NUM}>{formatUsd18(position.debt)}</TableCell>
                  <TableCell className={NUM}>{position.priceValid ? formatBps(position.currentLtvBps) : "--"}</TableCell>
                  <TableCell className={NUM}>{position.debt > 0n ? formatPrice18(position.liquidationPrice) : "--"}</TableCell>
                  <TableCell className="text-right">
                    <HealthBadge hf={position.priceValid ? position.healthFactor : null} debt={position.debt} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
