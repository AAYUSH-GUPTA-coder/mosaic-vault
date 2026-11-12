"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Stat, StatRow } from "@/components/dashboard/Stat";
import { HealthBadge, healthTone } from "@/components/dashboard/HealthBadge";
import { AssetLabel } from "@/components/dashboard/AssetLabel";
import { ExplorerLink } from "@/components/transactions/ExplorerLink";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { Skeleton } from "@/components/ui/skeleton";
import { OracleStatus } from "@/components/collateral/OracleStatus";
import { PositionActionDialog } from "./PositionActionDialog";
import { HistoryTable } from "./HistoryTable";
import { useMosaicAsset } from "@/hooks/useMosaicAssets";
import { usePosition } from "@/hooks/usePosition";
import { usePool } from "@/hooks/usePool";
import { useTxHistory } from "@/hooks/useTxHistory";
import { contracts } from "@/lib/blockchain/contracts";
import { ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";
import { formatBps, formatPrice18, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { relativeTime } from "@/lib/formatting/time";

export function PositionDetailView() {
  const params = useParams<{ asset: string }>();
  const raw = params?.asset ?? "";
  const valid = isAddress(raw);
  const { asset, isLoading: assetLoading, deployed } = useMosaicAsset(valid ? raw : undefined);
  const { position, isLoading: posLoading, wallet } = usePosition(asset?.address as Address | undefined);
  const { pool } = usePool();
  const history = useTxHistory(wallet, asset?.address);

  if (!valid) {
    return (
      <>
        <PageHeader title="Position" />
        <p className="text-sm text-muted-foreground">That is not a valid asset address. <Link href="/portfolio" className="text-accent underline-offset-4 hover:underline">Back to portfolio</Link>.</p>
      </>
    );
  }

  if (deployed && !assetLoading && !asset) {
    return (
      <>
        <PageHeader title="Position" />
        <p className="text-sm text-muted-foreground">This asset is not registered as collateral. <Link href="/collateral" className="text-accent underline-offset-4 hover:underline">See listed assets</Link>.</p>
      </>
    );
  }

  const stale = asset ? !asset.price.valid : false;
  const hasDebt = (position?.debt ?? 0n) > 0n;

  return (
    <>
      <PageHeader
        title={asset ? `${asset.symbol} position` : "Position"}
        description={asset ? `${asset.name}. Isolated: only this collateral backs this debt.` : undefined}
        actions={
          asset && position ? (
            <>
              <PositionActionDialog action="add" asset={asset} position={position} />
              <PositionActionDialog action="withdraw" asset={asset} position={position} disabled={position.collateral === 0n} />
              <PositionActionDialog action="repay" asset={asset} position={position} disabled={!hasDebt} />
              <PositionActionDialog action="borrow" asset={asset} position={position} variant="default" disabled={position.collateral === 0n} />
            </>
          ) : null
        }
      />

      {stale && asset ? (
        <p role="status" className="mb-4 rounded-lg border border-health-risk/30 bg-health-risk-bg px-4 py-3 text-sm text-foreground">
          The oracle price is stale or invalid. Borrows and withdrawals with debt are blocked until it updates; health factor shows as unavailable.
        </p>
      ) : null}

      <ConnectGate what="this position">
        {!asset || !position ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            <StatRow className="mb-6">
              <Stat label="Collateral" value={`${formatTokenAmount(position.collateral, asset.decimals)} ${asset.symbol}`} hint={position.priceValid ? formatUsd18(position.collateralValueUsd) : "No valid price"} />
              <Stat label="Debt" value={formatUsd18(position.debt)} hint={ZERO_INTEREST_NOTE} />
              <Stat label="Health factor" value={position.priceValid ? <HealthBadge hf={position.healthFactor} debt={position.debt} className="h-7 text-base" /> : "--"} tone={healthTone(position.priceValid ? position.healthFactor : null, position.debt)} hint="How far the position is from liquidation" />
              <Stat label="Liquidation price" value={hasDebt ? formatPrice18(position.liquidationPrice) : "--"} hint={hasDebt ? `${asset.symbol} price where health factor hits 1.0` : "No debt, so no liquidation price"} />
            </StatRow>

            <div className="grid gap-6 lg:grid-cols-2">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-5 text-sm">
                <dt className="col-span-2 font-semibold">Position</dt>
                <dt className="text-muted-foreground">Asset</dt>
                <dd className="text-right"><AssetLabel symbol={asset.symbol} kind={asset.kind} compact /></dd>
                <dt className="text-muted-foreground">Current LTV</dt>
                <dd className="text-right font-mono tabular-nums">{position.priceValid ? formatBps(position.currentLtvBps) : "--"}</dd>
                <dt className="text-muted-foreground">Max LTV</dt>
                <dd className="text-right font-mono tabular-nums">{formatBps(asset.config.maxLtvBps, 0)}</dd>
                <dt className="text-muted-foreground">Liquidation threshold</dt>
                <dd className="text-right font-mono tabular-nums">{formatBps(asset.config.liquidationThresholdBps, 0)}</dd>
                <dt className="text-muted-foreground">Liquidation penalty</dt>
                <dd className="text-right font-mono tabular-nums">{formatBps(asset.config.liquidationPenaltyBps, 0)}</dd>
                <dt className="text-muted-foreground">Max debt at current value</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(position.maxDebtUsd)}</dd>
                <dt className="text-muted-foreground">Borrowing limit</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(position.availableToBorrow)}</dd>
                <dt className="text-muted-foreground">Pool free MUSD</dt>
                <dd className="text-right font-mono tabular-nums">{formatUsd18(pool?.availableLiquidity ?? null)}</dd>
                <dt className="text-muted-foreground">Asset status</dt>
                <dd className="text-right">{asset.config.status === 1 ? "Active" : "Paused"}{pool?.paused ? ", engine paused" : ""}</dd>
              </dl>

              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-5 text-sm">
                <dt className="col-span-2 font-semibold">Oracle and contracts</dt>
                <dt className="text-muted-foreground">Oracle price</dt>
                <dd className="text-right"><OracleStatus asset={asset} stack /></dd>
                <dt className="text-muted-foreground">Last oracle update</dt>
                <dd className="text-right font-mono tabular-nums">{asset.price.updatedAt > 0n ? relativeTime(asset.price.updatedAt) : "--"}</dd>
                <dt className="text-muted-foreground">Price source</dt>
                <dd className="text-right text-xs">{asset.kind === "test_only" ? "Test-only oracle, admin-set" : "Chainlink-style BTC/USD precompile"}</dd>
                <dt className="text-muted-foreground">Oracle adapter</dt>
                <dd className="text-right"><ExplorerLink kind="address" value={asset.config.oracle} /></dd>
                <dt className="text-muted-foreground">Token</dt>
                <dd className="text-right"><ExplorerLink kind="token" value={asset.address} /></dd>
                <dt className="text-muted-foreground">Lending engine</dt>
                <dd className="text-right"><ExplorerLink kind="address" value={contracts.engine.address} /></dd>
                <dt className="text-muted-foreground">Collateral vault</dt>
                <dd className="text-right"><ExplorerLink kind="address" value={contracts.vault.address} /></dd>
                <dt className="text-muted-foreground">MUSD</dt>
                <dd className="text-right"><ExplorerLink kind="token" value={contracts.musd.address} /></dd>
              </dl>
            </div>

            <h2 className="mt-8 mb-3 text-base font-semibold">History</h2>
            <HistoryTable items={history.items} loading={history.isLoading} assets={[asset]} source={history.source} />
          </>
        )}
        {asset && posLoading && !position ? <Skeleton className="h-48 w-full" /> : null}
      </ConnectGate>
    </>
  );
}
