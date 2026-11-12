"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { ConnectGate } from "@/components/wallet/ConnectGate";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { FaucetButton } from "@/components/collateral/FaucetButton";
import { OracleStatus } from "@/components/collateral/OracleStatus";
import { PositionActionForm } from "./PositionActionForm";
import { useMosaicAssets } from "@/hooks/useMosaicAssets";
import { usePosition } from "@/hooks/usePosition";
import { formatBps, formatTokenAmount } from "@/lib/blockchain/formatters";
import type { Address } from "viem";

export function DepositView() {
  const params = useSearchParams();
  const { assets, isLoading, deployed } = useMosaicAssets();
  const [picked, setToken] = useState<string>(params.get("asset") ?? "");
  const token = picked || assets[0]?.address || "";
  const asset = assets.find((a) => a.address.toLowerCase() === token.toLowerCase());
  const { position, isLoading: posLoading } = usePosition(asset?.address as Address | undefined);

  return (
    <>
      <PageHeader title="Deposit" description="Add collateral to an isolated position. Each asset has its own position and its own risk parameters." />
      <ConnectGate what="deposit options">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,480px)_1fr]">
          <div className="grid gap-4 rounded-lg border border-border bg-card p-5">
            {deployed && isLoading ? <Skeleton className="h-10 w-full" /> : <AssetSelect assets={assets} value={asset?.address} onChange={setToken} />}
            {asset ? <FaucetButton asset={asset} /> : null}
            {asset && position ? (
              <PositionActionForm action="add" asset={asset} position={position} />
            ) : asset && posLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : !deployed ? (
              <p className="text-sm text-muted-foreground">Deposits open once the contracts are deployed.</p>
            ) : null}
          </div>
          {asset ? (
            <dl className="grid h-fit grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-card p-5 text-sm">
              <dt className="text-muted-foreground">Oracle price</dt>
              <dd className="text-right"><OracleStatus asset={asset} stack /></dd>
              <dt className="text-muted-foreground">Max LTV</dt>
              <dd className="text-right font-mono tabular-nums">{formatBps(asset.config.maxLtvBps, 0)}</dd>
              <dt className="text-muted-foreground">Liquidation threshold</dt>
              <dd className="text-right font-mono tabular-nums">{formatBps(asset.config.liquidationThresholdBps, 0)}</dd>
              <dt className="text-muted-foreground">Minimum deposit</dt>
              <dd className="text-right font-mono tabular-nums">{formatTokenAmount(asset.config.minDeposit, asset.decimals)} {asset.symbol}</dd>
              <dt className="text-muted-foreground">Room under deposit cap</dt>
              <dd className="text-right font-mono tabular-nums">{formatTokenAmount(asset.config.maxExposure > asset.totalCollateral ? asset.config.maxExposure - asset.totalCollateral : 0n, asset.decimals, { compact: true })} {asset.symbol}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="text-right">{asset.config.status === 1 ? "Active" : "Paused"}</dd>
              <dd className="col-span-2 mt-2 text-xs text-muted-foreground">{asset.kind === "test_only" ? "Test-only asset: minted by the team, priced by an admin, no real value." : "Verified external asset: real Mezo testnet BTC priced by the BTC/USD precompile."}</dd>
            </dl>
          ) : null}
        </div>
      </ConnectGate>
    </>
  );
}
