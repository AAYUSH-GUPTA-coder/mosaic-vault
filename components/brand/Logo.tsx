import { cn } from "@/lib/utils";

type LogoProps = {
  /** Mark height in pixels. The wordmark scales with it. */
  size?: number;
  /** "full" = mark + wordmark, "mark" = mark only, "wordmark" = text only. */
  variant?: "full" | "mark" | "wordmark";
  className?: string;
  /** Pass a title for standalone use; omit when wrapped in a labelled link. */
  title?: string;
};

/**
 * Mosaic Vault mark: a 2x2 grid of rounded squares with one tile offset.
 * Each tile is an isolated vault. Monochrome ink; uses currentColor so it
 * inverts with the theme.
 */
export function LogoMark({
  size = 24,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={cn("shrink-0", className)}
    >
      {title ? <title>{title}</title> : null}
      <rect x="2" y="2" width="9" height="9" rx="2" />
      <rect x="13" y="2" width="9" height="9" rx="2" />
      <rect x="2" y="13" width="9" height="9" rx="2" />
      <rect x="14.5" y="14.5" width="7.5" height="7.5" rx="1.8" />
    </svg>
  );
}

export function Logo({
  size = 22,
  variant = "full",
  className,
  title,
}: LogoProps) {
  if (variant === "mark") {
    return <LogoMark size={size} className={className} title={title} />;
  }

  const wordmark = (
    <span
      className="font-semibold tracking-[-0.01em] whitespace-nowrap"
      style={{ fontSize: Math.round(size * 0.78), lineHeight: 1 }}
    >
      Mosaic Vault
    </span>
  );

  if (variant === "wordmark") {
    return <span className={cn("inline-flex text-foreground", className)}>{wordmark}</span>;
  }

  return (
    <span
      className={cn("inline-flex items-center text-foreground", className)}
      style={{ gap: Math.round(size * 0.4) }}
    >
      <LogoMark size={size} title={title} />
      {wordmark}
    </span>
  );
}
