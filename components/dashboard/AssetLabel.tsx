import { cn } from "@/lib/utils";
import type { AssetKindLabel } from "@/types/mosaic";

export function KindBadge({ kind, className }: { kind: AssetKindLabel; className?: string }) {
  const text = kind === "verified_external" ? "Verified external" : kind === "test_only" ? "Test-only" : "Unsupported";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded px-1.5 text-[11px] font-medium",
        kind === "verified_external" && "bg-health-good-bg text-health-good",
        kind === "test_only" && "bg-health-warn-bg text-health-warn",
        kind === "unsupported" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  );
}

export function StatusBadge({ status }: { status: 0 | 1 | 2 }) {
  if (status === 2) return <span className="inline-flex h-5 items-center rounded bg-health-risk-bg px-1.5 text-[11px] font-medium text-health-risk">Paused</span>;
  if (status === 1) return <span className="inline-flex h-5 items-center rounded bg-health-good-bg px-1.5 text-[11px] font-medium text-health-good">Active</span>;
  return <span className="inline-flex h-5 items-center rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">Not listed</span>;
}

/** Symbol + name + kind badge. Test-only assets are labelled everywhere they appear. */
export function AssetLabel({ symbol, name, kind, compact }: { symbol: string; name?: string; kind: AssetKindLabel; compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="font-medium text-foreground">{symbol}</span>
      {!compact && name ? <span className="hidden truncate text-muted-foreground md:inline">{name}</span> : null}
      <KindBadge kind={kind} />
    </span>
  );
}
