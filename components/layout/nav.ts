import {
  ArrowDownToLine,
  Banknote,
  Briefcase,
  Layers,
  LayoutDashboard,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the nav only for managers; still routable for everyone (read-only). */
  managerOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/collateral", label: "Collateral", icon: Layers },
  { href: "/deposit", label: "Deposit", icon: ArrowDownToLine },
  { href: "/borrow", label: "Borrow", icon: Banknote },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/protocol", label: "Protocol", icon: ShieldCheck, managerOnly: true },
  { href: "/risk", label: "Risk", icon: SlidersHorizontal, managerOnly: true },
];

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/portfolio" && pathname.startsWith("/positions")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}
