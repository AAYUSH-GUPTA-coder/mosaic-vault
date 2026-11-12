"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AssetLabel, KindBadge, StatusBadge } from "@/components/dashboard/AssetLabel";
import { OracleStatus } from "./OracleStatus";
import { formatBps, formatRatioPct, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { UNSUPPORTED_ASSETS } from "@/lib/blockchain/config";
import type { MosaicAsset } from "@/types/mosaic";

const HEAD = "sticky top-0 bg-card text-xs font-medium text-muted-foreground";
const NUM = "text-right font-mono tabular-nums";

export function MarketTable({ assets, loading }: { assets: MosaicAsset[]; loading: boolean }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={HEAD}>Asset</TableHead>
            <TableHead className={`${HEAD} text-right`}>Oracle price</TableHead>
            <TableHead className={`${HEAD} text-right`}>Max LTV</TableHead>
            <TableHead className={`${HEAD} text-right`}>Liq. threshold</TableHead>
            <TableHead className={`${HEAD} text-right`}>Total deposited</TableHead>
            <TableHead className={`${HEAD} text-right`}>Borrow cap used</TableHead>
            <TableHead className={`${HEAD} text-right`}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : assets.map((a) => (
                <TableRow key={a.address} className="h-12">
                  <TableCell>
                    <Link href={`/positions/${a.address}`} className="hover:underline underline-offset-4">
                      <AssetLabel symbol={a.symbol} name={a.name} kind={a.kind} />
                    </Link>
                  </TableCell>
                  <TableCell className={NUM}>
                    <OracleStatus asset={a} stack />
                  </TableCell>
                  <TableCell className={NUM}>{formatBps(a.config.maxLtvBps, 0)}</TableCell>
                  <TableCell className={NUM}>{formatBps(a.config.liquidationThresholdBps, 0)}</TableCell>
                  <TableCell className={NUM}>
                    <div>{formatTokenAmount(a.totalCollateral, a.decimals, { compact: true })} {a.symbol}</div>
                    <div className="text-xs text-muted-foreground">cap {formatTokenAmount(a.config.maxExposure, a.decimals, { compact: true })}</div>
                  </TableCell>
                  <TableCell className={NUM}>
                    <div>{formatUsd18(a.assetDebt)} / {formatUsd18(a.config.borrowCap)}</div>
                    <div className="text-xs text-muted-foreground">{formatRatioPct(a.assetDebt, a.config.borrowCap)} used</div>
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge status={a.config.status} />
                  </TableCell>
                </TableRow>
              ))}
          {!loading && assets.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                No assets are registered yet. A risk manager registers them on the Risk page.
              </TableCell>
            </TableRow>
          ) : null}
          {UNSUPPORTED_ASSETS.map((u) => (
            <TableRow key={u.symbol} className="h-12 text-muted-foreground">
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium">{u.symbol}</span>
                  <span className="hidden md:inline">{u.name}</span>
                  <KindBadge kind="unsupported" />
                </span>
              </TableCell>
              <TableCell colSpan={5} className="text-sm">
                {u.description}
              </TableCell>
              <TableCell className="text-right">
                <StatusBadge status={0} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
