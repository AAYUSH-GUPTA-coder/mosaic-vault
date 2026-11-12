import { cn } from "@/lib/utils";
import { formatHealthFactor, healthBand } from "@/lib/blockchain/formatters";

const BAND_CLASS: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  healthy: "bg-health-good-bg text-health-good",
  watch: "bg-health-warn-bg text-health-warn",
  risk: "bg-health-risk-bg text-health-risk",
  liquidatable: "bg-health-risk text-white",
};

/** Health factor with the DESIGN.md colour band. Title explains the term once. */
export function HealthBadge({ hf, debt, className }: { hf: bigint | null | undefined; debt?: bigint; className?: string }) {
  const band = healthBand(hf, debt);
  const label = band === "liquidatable" ? "Liquidatable" : formatHealthFactor(hf);
  return (
    <span
      className={cn("inline-flex h-6 items-center rounded-md px-2 font-mono text-xs tabular-nums", BAND_CLASS[band], className)}
      title="Health factor: how far the position is from liquidation. Below 1.0 it can be liquidated."
    >
      {label}
    </span>
  );
}

export function healthTone(hf: bigint | null | undefined, debt?: bigint): "default" | "good" | "warn" | "risk" {
  const band = healthBand(hf, debt);
  if (band === "healthy") return "good";
  if (band === "watch") return "warn";
  if (band === "risk" || band === "liquidatable") return "risk";
  return "default";
}
