"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNetwork } from "@/hooks/useNetwork";
import { useMounted } from "@/hooks/useMounted";
import { cn } from "@/lib/utils";

/** "Mezo Testnet" when correct; a red warning with a switch button when the wallet is elsewhere. */
export function NetworkBadge({ className }: { className?: string }) {
  const { isWrongNetwork, isConnected, switchToMezo, isSwitching } = useNetwork();
  const mounted = useMounted();
  if (!mounted) return <span className={cn("h-7 w-28 rounded-md bg-muted", className)} aria-hidden />;

  if (isConnected && isWrongNetwork) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-health-risk-bg px-2 text-xs font-medium text-health-risk">
          <AlertTriangle className="size-3.5" aria-hidden />
          Wrong network
        </span>
        <Button size="sm" onClick={switchToMezo} disabled={isSwitching}>
          {isSwitching ? "Switching…" : "Switch to Mezo Testnet"}
        </Button>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground",
        className,
      )}
      title="All reads and transactions use Mezo Testnet (chain 31611)"
    >
      <span className="size-1.5 rounded-full bg-health-good" aria-hidden />
      Mezo Testnet
    </span>
  );
}
