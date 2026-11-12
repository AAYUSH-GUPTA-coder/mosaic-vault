"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { Stat, StatRow } from "@/components/dashboard/Stat";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { PositionsTable } from "./PositionsTable";
import { AllocationDonut } from "./AllocationDonut";
import { HistoryTable } from "./HistoryTable";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useTxHistory } from "@/hooks/useTxHistory";
import { formatBps, formatUsd18 } from "@/lib/blockchain/formatters";
import { ltvBps } from "@/lib/oracle/math";
import { ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";

export function PortfolioView() {
  const { open, entries, totals, isLoading, deployed, wallet } = usePortfolio();
  const history = useTxHistory(wallet);
  const assets = entries.map((e) => e.asset);

  return (
    <>
      <PageHeader title="Portfolio" description="All of your positions on Mosaic Vault, with totals and history." />
      <ConnectGate what="your portfolio">
        <StatRow className="mb-6">
          <Stat label="Collateral value" value={formatUsd18(totals.collateralUsd)} loading={isLoading} />
          <Stat label="Debt" value={formatUsd18(totals.debt)} hint={ZERO_INTEREST_NOTE} loading={isLoading} />
          <Stat label="Blended LTV" value={formatBps(ltvBps(totals.debt, totals.collateralUsd))} hint="Debt over total collateral value" loading={isLoading} />
          <Stat label="Open positions" value={String(open.length)} loading={isLoading} />
        </StatRow>

        <div className="grid gap-6 lg:grid-cols-[1fr_minmax(0,380px)]">
          <section>
            <h2 className="mb-3 text-base font-semibold">Positions</h2>
            {!isLoading && open.length === 0 ? (
              <EmptyState message={deployed ? "No open positions. Deposit collateral to open one." : "Contracts are not deployed yet."} action={deployed ? { href: "/deposit", label: "Deposit collateral" } : undefined} />
            ) : (
              <PositionsTable entries={open} loading={isLoading} />
            )}
          </section>
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 text-base font-semibold">Collateral split</h2>
            <AllocationDonut entries={open} />
          </section>
        </div>

        <h2 className="mt-8 mb-3 text-base font-semibold">History</h2>
        <HistoryTable items={history.items} loading={history.isLoading} assets={assets} source={history.source} />
      </ConnectGate>
    </>
  );
}
