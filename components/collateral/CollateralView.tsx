"use client";

import { PageHeader } from "@/components/dashboard/PageHeader";
import { MarketTable } from "./MarketTable";
import { useMosaicAssets } from "@/hooks/useMosaicAssets";

export function CollateralView() {
  const { assets, isLoading, deployed, isError } = useMosaicAssets();
  return (
    <>
      <PageHeader title="Collateral" description="Every listed asset with its live oracle price and risk parameters. Test-only assets have admin-set prices and no value." />
      {isError ? <p className="mb-4 text-sm text-health-risk">Could not read the registry. Check the RPC URL and contract addresses.</p> : null}
      <MarketTable assets={assets} loading={deployed && isLoading} />
      <p className="mt-3 text-xs text-muted-foreground">Max LTV is the most you can borrow against collateral value. Liquidation threshold is the loan-to-value at which a position can be liquidated. A price is marked stale when it is older than the limit its oracle allows.</p>
    </>
  );
}
