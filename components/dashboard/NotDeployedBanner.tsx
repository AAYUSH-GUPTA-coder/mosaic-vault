"use client";

import { AlertTriangle } from "lucide-react";
import { isDeployed, missingContracts } from "@/lib/blockchain/config";

const LABELS: Record<string, string> = {
  registry: "NEXT_PUBLIC_COLLATERAL_REGISTRY_ADDRESS",
  vault: "NEXT_PUBLIC_COLLATERAL_VAULT_ADDRESS",
  pool: "NEXT_PUBLIC_LENDING_POOL_ADDRESS",
  engine: "NEXT_PUBLIC_LENDING_ENGINE_ADDRESS",
  liquidationEngine: "NEXT_PUBLIC_LIQUIDATION_ENGINE_ADDRESS",
};

/** Shown on every app page until all contract addresses are configured. Never crashes the page. */
export function NotDeployedBanner() {
  if (isDeployed()) return null;
  const missing = missingContracts();
  return (
    <div role="status" className="mb-6 flex gap-3 rounded-lg border border-health-warn/30 bg-health-warn-bg px-4 py-3 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-health-warn" aria-hidden />
      <div>
        <p className="font-medium text-foreground">Contracts are not deployed yet.</p>
        <p className="mt-0.5 text-muted-foreground">
          Chain reads are off until these are set in <span className="font-mono">.env</span>:{" "}
          <span className="font-mono">{missing.map((m) => LABELS[m]).join(", ")}</span>.
        </p>
      </div>
    </div>
  );
}
