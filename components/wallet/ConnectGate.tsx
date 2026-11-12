"use client";

import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/useMounted";
import { useNetwork } from "@/hooks/useNetwork";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Renders children only with a connected wallet on Mezo Testnet.
 * Otherwise a one-sentence empty state with the next action.
 */
export function ConnectGate({ children, what = "your positions" }: { children: React.ReactNode; what?: string }) {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const { isWrongNetwork, switchToMezo, isSwitching } = useNetwork();
  const { openConnectModal } = useConnectModal();

  if (!mounted) return <Skeleton className="h-40 w-full rounded-lg" />;

  if (!isConnected) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">Connect a wallet to see {what}.</p>
        <Button className="mt-3" onClick={openConnectModal}>
          Connect wallet
        </Button>
      </div>
    );
  }

  if (isWrongNetwork) {
    return (
      <div className="rounded-lg border border-health-risk/30 bg-health-risk-bg p-6">
        <p className="text-sm text-foreground">Your wallet is on another network. Mosaic Vault only runs on Mezo Testnet.</p>
        <Button className="mt-3" onClick={switchToMezo} disabled={isSwitching}>
          {isSwitching ? "Switching…" : "Switch to Mezo Testnet"}
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
