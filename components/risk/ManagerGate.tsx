"use client";

import { Lock } from "lucide-react";
import { useAccount } from "wagmi";
import { useIsManager } from "@/hooks/useIsManager";
import { useMounted } from "@/hooks/useMounted";

/** Read-only notice for non-managers. Pages still render their data below. */
export function ManagerNotice() {
  const mounted = useMounted();
  const { isConnected } = useAccount();
  const { isManager, isLoading } = useIsManager();
  if (!mounted || isLoading || isManager) return null;
  return (
    <div role="status" className="mb-6 flex gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <p className="text-muted-foreground">
        {isConnected ? "This page is read-only for your wallet. Actions need the RISK_MANAGER_ROLE on the registry." : "Connect a manager wallet to use the actions on this page. Everything else is read-only."}
      </p>
    </div>
  );
}
