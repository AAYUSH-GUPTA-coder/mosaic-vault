import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/brand/Logo";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * Standalone 404. It renders inside the root layout only, so it does not
 * depend on either the marketing or the app shell.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <Link href="/" aria-label="Mosaic Vault home" className="mb-10">
        <Logo size={24} />
      </Link>
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em]">Page not found</h1>
      <p className="mt-3 max-w-sm text-muted-foreground">
        This page does not exist. Check the address or go back to the start.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
        >
          Go to the home page
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors duration-150 hover:bg-muted"
        >
          Open app
        </Link>
      </div>
    </main>
  );
}
