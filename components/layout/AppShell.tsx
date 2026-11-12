"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { Menu } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NetworkBadge } from "@/components/wallet/NetworkBadge";
import { WalletButton } from "@/components/wallet/WalletButton";
import { NotDeployedBanner } from "@/components/dashboard/NotDeployedBanner";
import { useIsManager } from "@/hooks/useIsManager";
import { DISCLAIMER } from "@/lib/blockchain/config";
import { SidebarNav } from "./SidebarNav";
import { ThemeToggle } from "@/components/landing/ThemeToggle";
import { deployedContracts, shortAddress } from "./ContractLinks";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isManager } = useIsManager();
  const [open, setOpen] = useState(false);
  const contracts = deployedContracts();

  return (
    <div className="flex min-h-dvh w-full">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/dashboard" aria-label="Mosaic Vault dashboard" className="text-foreground">
            <Logo size={22} />
          </Link>
        </div>
        <div className="flex-1 px-3 pt-2">
          <Suspense fallback={null}>
            <SidebarNav showManager={isManager} />
          </Suspense>
        </div>
        <p className="px-4 pb-4 text-xs leading-5 text-muted-foreground">{DISCLAIMER}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center px-4">
                <Logo size={22} />
              </div>
              <div className="px-3">
                <Suspense fallback={null}>
                  <SidebarNav showManager={isManager} onNavigate={() => setOpen(false)} />
                </Suspense>
              </div>
              <p className="mt-auto px-4 pb-4 text-xs leading-5 text-muted-foreground">{DISCLAIMER}</p>
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" className="text-foreground lg:hidden" aria-label="Mosaic Vault dashboard">
            <Logo size={20} variant="mark" />
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <NetworkBadge className="hidden sm:flex" />
            <WalletButton />
            <ThemeToggle />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">
          <NotDeployedBanner />
          <div className="sm:hidden">
            <NetworkBadge className="mb-4" />
          </div>
          {children}
        </main>

        <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>{DISCLAIMER} No interest accrues in this MVP.</p>
          {contracts.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span>Testnet contracts:</span>
              {contracts.map((c) => (
                <a key={c.key} href={c.href} target="_blank" rel="noreferrer" title={c.address} className="underline-offset-2 hover:text-foreground hover:underline">
                  {c.label} <span className="font-mono">{shortAddress(c.address)}</span>
                </a>
              ))}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
