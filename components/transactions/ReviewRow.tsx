import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** "What changes": label, current -> next. Mono tabular numbers, right aligned. */
export function ReviewRow({ label, from, to, tone, hint }: { label: string; from?: React.ReactNode; to: React.ReactNode; tone?: "default" | "good" | "warn" | "risk"; hint?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <div className="min-w-0">
        <div className="text-muted-foreground">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground/80">{hint}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 font-mono tabular-nums">
        {from !== undefined ? (
          <>
            <span className="text-muted-foreground">{from}</span>
            <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
          </>
        ) : null}
        <span className={cn(tone === "good" && "text-health-good", tone === "warn" && "text-health-warn", tone === "risk" && "text-health-risk")}>{to}</span>
      </div>
    </div>
  );
}

export function ReviewList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border rounded-lg border border-border bg-card px-4", className)}>{children}</div>;
}
