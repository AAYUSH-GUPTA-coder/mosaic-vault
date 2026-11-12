import { cn } from "@/lib/utils";

export type AssetStatus = "verified" | "test" | "disabled";

const styles: Record<AssetStatus, { label: string; className: string }> = {
  verified: {
    label: "Verified external",
    className: "bg-health-good-bg text-health-good",
  },
  test: {
    label: "Test-only",
    className: "bg-health-warn-bg text-health-warn",
  },
  disabled: {
    label: "Not enabled",
    className: "bg-info-bg text-info",
  },
};

/** Only used where the status carries meaning (asset kind). */
export function StatusBadge({
  status,
  className,
}: {
  status: AssetStatus;
  className?: string;
}) {
  const s = styles[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-md px-2 text-xs font-medium whitespace-nowrap",
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  );
}
