import Link from "next/link";
import { Button } from "@/components/ui/button";

/** One plain sentence saying what to do next, with an optional action. */
export function EmptyState({ message, action }: { message: string; action?: { href: string; label: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  );
}
