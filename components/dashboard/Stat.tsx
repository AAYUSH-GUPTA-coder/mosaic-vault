import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

/** One labelled number. Numbers are mono + tabular. Use in a bordered row, not a card grid. */
export function Stat({ label, value, hint, loading, className, tone }: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  loading?: boolean;
  className?: string;
  tone?: "default" | "good" | "warn" | "risk";
}) {
  return (
    <div className={cn("min-w-0 py-3", className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 truncate font-mono text-lg tabular-nums text-foreground",
          tone === "good" && "text-health-good",
          tone === "warn" && "text-health-warn",
          tone === "risk" && "text-health-risk",
        )}
      >
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A horizontal row of stats separated by hairlines; collapses to 2 columns on mobile. */
export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 rounded-lg border border-border bg-card px-4 md:flex md:divide-x md:divide-border md:[&>div]:flex-1 md:[&>div]:pl-6 md:[&>div:first-child]:pl-0", className)}>
      {children}
    </dl>
  );
}
