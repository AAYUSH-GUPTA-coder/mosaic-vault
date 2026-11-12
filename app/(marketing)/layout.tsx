import { MarketingNav } from "@/components/landing/MarketingNav";
import { MarketingFooter } from "@/components/landing/MarketingFooter";

export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div data-surface="marketing" className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-soft focus:outline-2 focus:outline-ring"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main" className="flex-1">
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
