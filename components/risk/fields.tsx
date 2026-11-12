"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Label above input, helper below, error below that. Mono for addresses and numbers. */
export function Field({ label, error, hint, mono, className, children, id }: { label: string; error?: string; hint?: string; mono?: boolean; className?: string; children?: React.ReactNode; id?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-xs text-health-risk">{error}</p> : hint ? <p className={cn("text-xs text-muted-foreground", mono && "font-mono")}>{hint}</p> : null}
    </div>
  );
}

export function TextInput(props: React.ComponentProps<typeof Input> & { mono?: boolean }) {
  const { mono, className, ...rest } = props;
  return <Input {...rest} autoComplete="off" spellCheck={false} className={cn("h-9", mono && "font-mono tabular-nums", className)} />;
}

export function Section({ title, description, children, demo }: { title: string; description?: string; children: React.ReactNode; demo?: boolean }) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {demo ? <span className="inline-flex h-5 items-center rounded bg-health-warn-bg px-1.5 text-[11px] font-medium text-health-warn">Demo control, test-only</span> : null}
      </div>
      {description ? <p className="-mt-2 mb-4 max-w-[65ch] text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </section>
  );
}
