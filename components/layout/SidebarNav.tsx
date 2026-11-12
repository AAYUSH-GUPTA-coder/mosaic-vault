"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isActivePath } from "./nav";

export function SidebarNav({ showManager, onNavigate }: { showManager: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((i) => !i.managerOnly || showManager);
  return (
    <nav aria-label="Primary" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActivePath(pathname, item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-150",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
