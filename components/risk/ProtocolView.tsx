"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Stat, StatRow } from "@/components/dashboard/Stat";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AssetLabel } from "@/components/dashboard/AssetLabel";
import { OracleStatus } from "@/components/collateral/OracleStatus";
import { ManagerNotice } from "./ManagerGate";
import { Section } from "./fields";
import { LiquidationScanner } from "./LiquidationScanner";
import { LiquidateForm } from "./LiquidateForm";
import { PoolLiquidityForm } from "./PoolLiquidityForm";
import { PauseEngineForm } from "./OracleAndPauseForms";
import { useMosaicAssets } from "@/hooks/useMosaicAssets";
import { usePool } from "@/hooks/usePool";
import { useIsManager } from "@/hooks/useIsManager";
import { formatRatioPct, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";
import type { ScannedPosition } from "@/hooks/useLiquidatableScan";

export function ProtocolView() {
  const { assets, isLoading, deployed } = useMosaicAssets();
  const { pool, isLoading: poolLoading } = usePool();
  const { roles } = useIsManager();
  const [pick, setPick] = useState<ScannedPosition | null>(null);
  const paused = assets.filter((a) => a.config.status === 2);

  return (
    <>
      <PageHeader title="Protocol" description="Pool health, exposure against caps, oracle status and liquidatable positions. Manager actions need the matching role." />
      <ManagerNotice />

      <StatRow className="mb-6">
        <Stat label="Pool free MUSD" value={formatUsd18(pool?.availableLiquidity ?? null)} loading={deployed && poolLoading} />
        <Stat label="Outstanding debt" value={formatUsd18(pool?.totalOutstandingDebt ?? null)} hint={ZERO_INTEREST_NOTE} loading={deployed && poolLoading} />
        <Stat label="Utilisation" value={pool ? formatRatioPct(pool.totalOutstandingDebt, pool.totalPoolAssets) : "--"} hint="Debt over pool assets" loading={deployed && poolLoading} />
        <Stat label="Bad debt written off" value={formatUsd18(pool?.totalBadDebt ?? null)} tone={pool && pool.totalBadDebt > 0n ? "risk" : "default"} loading={deployed && poolLoading} />
        <Stat label="Engine" value={pool ? (pool.paused ? "Paused" : "Running") : "--"} tone={pool?.paused ? "risk" : "default"} loading={deployed && poolLoading} />
      </StatRow>

      <h2 className="mb-3 text-base font-semibold">Exposure and oracles</h2>
      <div className="mb-8 overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-muted-foreground">Asset</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Deposited vs cap</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Debt vs borrow cap</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Oracle</TableHead>
              <TableHead className="text-right text-xs text-muted-foreground">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((a) => (
              <TableRow key={a.address} className="h-12">
                <TableCell><AssetLabel symbol={a.symbol} kind={a.kind} compact /></TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatTokenAmount(a.totalCollateral, a.decimals, { compact: true })} / {formatTokenAmount(a.config.maxExposure, a.decimals, { compact: true })} {a.symbol}
                  <div className="text-xs text-muted-foreground">{formatRatioPct(a.totalCollateral, a.config.maxExposure)}</div>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {formatUsd18(a.assetDebt)} / {formatUsd18(a.config.borrowCap)}
                  <div className="text-xs text-muted-foreground">{formatRatioPct(a.assetDebt, a.config.borrowCap)}</div>
                </TableCell>
                <TableCell className="text-right"><OracleStatus asset={a} stack /></TableCell>
                <TableCell className="text-right text-sm">{a.config.status === 2 ? <span className="text-health-risk">Paused</span> : "Active"}</TableCell>
              </TableRow>
            ))}
            {!isLoading && assets.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">{deployed ? "No assets registered yet." : "Contracts are not deployed yet."}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {paused.length ? <p className="-mt-6 mb-8 text-sm text-health-risk">Paused assets: {paused.map((a) => a.symbol).join(", ")}. No new deposits or borrows; repay, withdraw and liquidate still work.</p> : null}

      <h2 className="mb-3 text-base font-semibold">Liquidatable positions</h2>
      {deployed ? <LiquidationScanner assets={assets} onPick={setPick} /> : <p className="text-sm text-muted-foreground">The scanner runs once contracts are deployed.</p>}

      <Dialog open={Boolean(pick)} onOpenChange={(o) => !o && setPick(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Liquidate position</DialogTitle>
            <DialogDescription>Permissionless. You repay MUSD and receive collateral plus the penalty.</DialogDescription>
          </DialogHeader>
          {pick ? <LiquidateForm key={`${pick.user}:${pick.asset}`} assets={assets} initial={{ user: pick.user, asset: pick.asset }} /> : null}
        </DialogContent>
      </Dialog>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Section title="Pool liquidity" description="Liquidity providers fund the MUSD that borrowers draw. Withdrawals are limited to free MUSD.">
          <PoolLiquidityForm pool={pool} disabled={!roles.liquidityProvider} />
        </Section>
        <Section title="Emergency pause" description="Pausing the engine stops deposits, borrows, withdrawals and liquidations. Repayments continue.">
          <PauseEngineForm paused={pool?.paused ?? false} disabled={!roles.pauser} />
        </Section>
      </div>
    </>
  );
}
