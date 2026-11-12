"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./PageHeader";
import { Stat, StatRow } from "./Stat";
import { EmptyState } from "./EmptyState";
import { healthTone } from "./HealthBadge";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { PositionsTable } from "@/components/positions/PositionsTable";
import { usePortfolio } from "@/hooks/usePortfolio";
import { usePool } from "@/hooks/usePool";
import { useMosaicAssets } from "@/hooks/useMosaicAssets";
import { formatHealthFactor, formatRatioPct, formatUsd18 } from "@/lib/blockchain/formatters";
import { ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";

export function DashboardView() {
  const { isConnected } = useAccount();
  const { open, totals, isLoading, deployed } = usePortfolio();
  const { pool, isLoading: poolLoading } = usePool();
  const { assets } = useMosaicAssets();

  const lowestHf = open.reduce<bigint | null>((acc, e) => {
    if (e.position.debt === 0n || !e.position.priceValid) return acc;
    return acc === null || e.position.healthFactor < acc ? e.position.healthFactor : acc;
  }, null);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Isolated positions per asset. Deposit collateral, borrow MUSD, repay any time."
        actions={
          <>
            <Button asChild variant="outline"><Link href="/deposit">Deposit</Link></Button>
            <Button asChild><Link href="/borrow">Borrow</Link></Button>
          </>
        }
      />

      <ConnectGate what="your positions">
        <StatRow className="mb-6">
          <Stat label="Collateral value" value={formatUsd18(totals.collateralUsd)} loading={isLoading} />
          <Stat label="Debt" value={formatUsd18(totals.debt)} hint={ZERO_INTEREST_NOTE} loading={isLoading} />
          <Stat label="Borrowing limit" value={formatUsd18(totals.availableToBorrow)} hint="Across all positions, after caps and pool liquidity" loading={isLoading} />
          <Stat label="Lowest health factor" value={lowestHf === null ? "No debt" : formatHealthFactor(lowestHf)} tone={lowestHf === null ? "default" : healthTone(lowestHf, 1n)} hint="How far the riskiest position is from liquidation" loading={isLoading} />
        </StatRow>

        <h2 className="mb-3 text-base font-semibold">Open positions</h2>
        {!isLoading && open.length === 0 ? (
          <EmptyState message={deployed ? "You have no open positions. Deposit collateral to open one." : "Contracts are not deployed yet, so there is nothing to show."} action={deployed ? { href: "/deposit", label: "Deposit collateral" } : undefined} />
        ) : (
          <PositionsTable entries={open} loading={isLoading} />
        )}
      </ConnectGate>

      <h2 className="mt-8 mb-3 text-base font-semibold">Protocol</h2>
      <StatRow>
        <Stat label="Pool free MUSD" value={formatUsd18(pool?.availableLiquidity ?? null)} loading={poolLoading && deployed} />
        <Stat label="Outstanding debt" value={formatUsd18(pool?.totalOutstandingDebt ?? null)} hint={ZERO_INTEREST_NOTE} loading={poolLoading && deployed} />
        <Stat label="Utilisation" value={pool ? formatRatioPct(pool.totalOutstandingDebt, pool.totalPoolAssets) : "--"} hint="Debt as a share of pool assets" loading={poolLoading && deployed} />
        <Stat label="Listed assets" value={deployed ? String(assets.length) : "--"} hint={<Link href="/collateral" className="text-accent underline-offset-4 hover:underline">See the market</Link>} />
      </StatRow>
      {!isConnected ? <p className="mt-4 text-xs text-muted-foreground">Prices and parameters are read live from Mezo Testnet. Health factor bands: 1.5 and above is comfortable, below 1.1 is at risk, below 1.0 can be liquidated.</p> : null}
    </>
  );
}
