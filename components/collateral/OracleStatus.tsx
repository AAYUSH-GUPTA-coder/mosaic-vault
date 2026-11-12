"use client";

import { useEffect, useState } from "react";
import { formatPrice18 } from "@/lib/blockchain/formatters";
import { relativeTime } from "@/lib/formatting/time";
import { cn } from "@/lib/utils";
import type { MosaicAsset } from "@/types/mosaic";

/** Re-render once a minute so "x ago" stays honest. */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function OracleStatus({ asset, stack }: { asset: MosaicAsset; stack?: boolean }) {
  const now = useNow();
  const stale = !asset.price.valid;
  return (
    <span className={cn("inline-flex min-w-0 gap-x-2", stack ? "flex-col items-end" : "items-baseline")}>
      <span className="font-mono tabular-nums text-foreground">{asset.price.valid ? formatPrice18(asset.priceUsd18) : "No price"}</span>
      <span className={cn("text-xs", stale ? "text-health-risk" : "text-muted-foreground")}>
        {asset.price.valid ? `${relativeTime(asset.price.updatedAt, now)}${stale ? " (stale)" : ""}` : "invalid"}
      </span>
    </span>
  );
}
