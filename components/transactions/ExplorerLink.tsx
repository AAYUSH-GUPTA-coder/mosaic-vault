import { ExternalLink } from "lucide-react";
import { explorer, shortAddress, shortHash } from "@/lib/blockchain/formatters";
import { cn } from "@/lib/utils";

type Kind = "tx" | "address" | "token";

export function ExplorerLink({ kind, value, label, className, full }: { kind: Kind; value: string; label?: string; className?: string; full?: boolean }) {
  const href = explorer[kind](value);
  const text = label ?? (full ? value : kind === "tx" ? shortHash(value) : shortAddress(value));
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("inline-flex items-center gap-1 font-mono text-xs text-accent underline-offset-4 hover:underline", className)}
    >
      {text}
      <ExternalLink className="size-3 shrink-0" aria-hidden />
      <span className="sr-only">(opens in the explorer)</span>
    </a>
  );
}
