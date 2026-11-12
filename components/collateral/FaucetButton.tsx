"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { keccak256, toHex } from "viem";
import { testCollateralTokenAbi } from "@/lib/blockchain/abis";
import { Droplets } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExplorerLink } from "@/components/transactions/ExplorerLink";
import { useTxFlow } from "@/hooks/useTxFlow";
import { readFaucetCap } from "@/lib/blockchain/reads";
import { faucet } from "@/lib/blockchain/writes";
import { qk } from "@/lib/blockchain/queryKeys";
import { formatTokenAmount } from "@/lib/blockchain/formatters";
import type { MosaicAsset } from "@/types/mosaic";

const MINTER_ROLE = keccak256(toHex("MINTER_ROLE"));

/**
 * Test-only tokens are minted by the team (MINTER_ROLE), never by a public faucet: free collateral
 * would let anyone borrow real MUSD from the pool. Minters see a mint button; everyone else sees a note.
 */
export function FaucetButton({ asset }: { asset: MosaicAsset }) {
  const client = usePublicClient();
  const { address } = useAccount();
  const flow = useTxFlow();
  const { data: cap } = useQuery({ queryKey: qk.faucetCap(asset.address), queryFn: () => readFaucetCap(client!, asset.address), enabled: Boolean(client) && asset.hasFaucet });
  const { data: isMinter } = useQuery({
    queryKey: ["mosaic", "minter", asset.address, address],
    queryFn: () => client!.readContract({ address: asset.address, abi: testCollateralTokenAbi, functionName: "hasRole", args: [MINTER_ROLE, address!] }),
    enabled: Boolean(client && address) && asset.hasFaucet,
  });
  if (!asset.hasFaucet) return null;
  if (!isMinter) {
    return (
      <p className="rounded-lg border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
        {asset.symbol} is a test token the team mints for demos. To borrow yourself, deposit testnet BTC.
      </p>
    );
  }
  const amount = cap ?? 0n;
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-health-warn/30 bg-health-warn-bg px-3 py-2 text-sm">
      <Droplets className="size-4 text-health-warn" aria-hidden />
      <span className="text-foreground">You can mint this test token.</span>
      <Button size="sm" variant="outline" disabled={flow.busy || amount === 0n} onClick={() => void flow.execute({ write: (ctx) => faucet(ctx, asset.address, amount) })}>
        {flow.busy ? "Minting…" : `Get ${formatTokenAmount(amount, asset.decimals, { compact: true })} ${asset.symbol}`}
      </Button>
      {flow.status === "pending" && flow.hash ? <ExplorerLink kind="tx" value={flow.hash} label="pending" /> : null}
      {flow.status === "confirmed" && flow.hash ? <span className="text-xs text-health-good">Minted. <ExplorerLink kind="tx" value={flow.hash} /></span> : null}
      {flow.error ? <span className="text-xs text-health-risk">{flow.error.message}</span> : null}
    </div>
  );
}
