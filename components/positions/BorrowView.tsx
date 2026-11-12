"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { HealthBadge } from "@/components/dashboard/HealthBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { PositionActionForm } from "./PositionActionForm";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePool } from "@/hooks/usePool";
import { formatBps, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";

export function BorrowView() {
  const params = useSearchParams();
  const { entries, open, isLoading, deployed } = usePortfolio();
  const { pool } = usePool();
  const [picked, setToken] = useState<string>(params.get("asset") ?? "");
  const token = picked || open[0]?.asset.address || "";
  const entry = entries.find((e) => e.asset.address.toLowerCase() === token.toLowerCase());

  return (
    <>
      <PageHeader title="Borrow" description={`Borrow MUSD against one of your positions. ${ZERO_INTEREST_NOTE}.`} />
      <ConnectGate what="your positions">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : open.length === 0 ? (
          <EmptyState message={deployed ? "You need collateral before you can borrow. Deposit first." : "Contracts are not deployed yet."} action={deployed ? { href: "/deposit", label: "Deposit collateral" } : undefined} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,480px)_1fr]">
            <div className="grid gap-4 rounded-lg border border-border bg-card p-5">
              <AssetSelect assets={open.map((e) => e.asset)} value={entry?.asset.address} onChange={setToken} label="Position" />
              {entry ? <PositionActionForm action="borrow" asset={entry.asset} position={entry.position} /> : null}
            </div>
            {entry ? (
              <dl className="grid h-fit grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-5 text-sm">
                <dt className="text-muted-foreground">Collateral</dt>
                <dd className="text-right font-mono tabular-nums">{formatTokenAmount(entry.position.collateral, entry.asset.decimals)} {entry.asset.symbol}</dd>
                <dt className="text-muted-foreground">Collateral value</dt>
                <dd className="text-right font-mono tabular-nums">{entry.position.priceValid ? formatUsd18(entry.position.collateralValueUsd) : "No price"}</dd>
                <dt className="text-muted-foreground">Max LTV</dt>
                <dd className="text-right font-mono tabular-nums">{formatBps(entry.asset.config.maxLtvBps, 0)}</dd>
                <dt className="text-muted-foreground">Current LTV</dt>
                <dd className="text-right font-mono tabular-nums">{formatBps(entry.position.currentLtvBps)}</dd>
                <dt className="text-muted-foreground">Health factor</dt>
                <dd className="text-right"><HealthBadge hf={entry.position.priceValid ? entry.position.healthFactor : null} debt={entry.position.debt} /></dd>
                <dt className="text-muted-foreground">Borrowing limit</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(entry.position.availableToBorrow)}</dd>
                <dt className="text-muted-foreground">Pool free MUSD</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(pool?.availableLiquidity ?? null)}</dd>
                <dt className="text-muted-foreground">Borrow cap left</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(entry.asset.config.borrowCap > entry.asset.assetDebt ? entry.asset.config.borrowCap - entry.asset.assetDebt : 0n)}</dd>
                <dd className="col-span-2 mt-2 text-xs text-muted-foreground">
                  Borrowing limit is the smallest of: collateral value times max LTV minus current debt, the pool&apos;s free MUSD, and the asset&apos;s remaining borrow cap. <Link href={`/positions/${entry.asset.address}`} className="text-accent underline-offset-4 hover:underline">Open the position</Link>.
                </dd>
              </dl>
            ) : null}
          </div>
        )}
      </ConnectGate>
    </>
  );
}
