"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/landing/ThemeToggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/collateral", label: "Collateral" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#risk-model", label: "Risk model" },
  { href: "https://mezo.org/docs", label: "Docs", external: true },
] as const;

export function MarketingNav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
      <nav
        aria-label="Main"
        className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between px-4 sm:px-6"
      >
        <Link
          href="/"
          aria-label="Mosaic Vault home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Logo size={22} />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                target={"external" in link ? "_blank" : undefined}
                rel={"external" in link ? "noreferrer" : undefined}
                className="inline-flex h-9 items-center gap-1 rounded-md px-3 text-[15px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {link.label}
                {"external" in link ? (
                  <ArrowUpRight className="size-3.5" aria-hidden="true" />
                ) : null}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="hidden h-9 items-center rounded-md bg-primary px-4 text-[15px] font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px sm:inline-flex"
          >
            Open app
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-md text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      <div
        id="mobile-menu"
        hidden={!open}
        className={cn("border-t border-border bg-background md:hidden", open && "block")}
      >
        <ul className="mx-auto flex w-full max-w-[1120px] flex-col px-4 py-2 sm:px-6">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                target={"external" in link ? "_blank" : undefined}
                rel={"external" in link ? "noreferrer" : undefined}
                className="flex h-12 items-center justify-between rounded-md px-2 text-base text-foreground transition-colors duration-150 hover:bg-muted"
              >
                {link.label}
                {"external" in link ? (
                  <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden="true" />
                ) : null}
              </Link>
            </li>
          ))}
          <li className="py-2 sm:hidden">
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="flex h-11 items-center justify-center rounded-md bg-primary text-base font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90"
            >
              Open app
            </Link>
          </li>
        </ul>
      </div>
    </header>
  );
}
