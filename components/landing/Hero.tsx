import Link from "next/link";
import { Container } from "@/components/landing/Container";
import { StatusBadge, type AssetStatus } from "@/components/landing/StatusBadge";
import { cn } from "@/lib/utils";

const tiles: {
  symbol: string;
  name: string;
  status: AssetStatus;
  ltv: string;
  threshold: string;
}[] = [
  { symbol: "BTC", name: "Mezo testnet BTC", status: "verified", ltv: "60%", threshold: "70%" },
  { symbol: "tWBTC", name: "Test wrapped BTC", status: "test", ltv: "60%", threshold: "70%" },
  { symbol: "tUSD", name: "Test stablecoin", status: "test", ltv: "70%", threshold: "80%" },
  { symbol: "RWA", name: "Tokenized assets", status: "disabled", ltv: "", threshold: "" },
];

export function Hero() {
  return (
    <section className="border-b border-border">
      <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-24">
        <div>
          <h1 className="max-w-xl text-[2.25rem] leading-[1.08] font-semibold tracking-[-0.015em] sm:text-5xl lg:text-[3.5rem]">
            More collateral. More access to Bitcoin-backed liquidity.
          </h1>
          <p className="mt-6 max-w-lg text-lg text-muted-foreground">
            Deposit BTC or another supported asset into its own vault and borrow
            MUSD on Mezo without selling what you hold.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/dashboard"
              className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-5 text-base font-medium text-primary-foreground transition-colors duration-150 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
            >
              Open app
            </Link>
            <Link
              href="/collateral"
              className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-card px-5 text-base font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px"
            >
              Explore collateral
            </Link>
          </div>
        </div>

        {/* Four isolated vaults, drawn the same way as the logo mark. */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4" aria-label="Supported collateral">
          {tiles.map((t, i) => {
            const disabled = t.status === "disabled";
            return (
              <div
                key={t.symbol}
                className={cn(
                  "flex aspect-square flex-col justify-between rounded-lg border p-4 sm:p-5",
                  disabled
                    ? "border-dashed border-border bg-transparent"
                    : "border-border bg-card shadow-soft",
                  i === 3 && "mt-2 ml-2 sm:mt-3 sm:ml-3",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div
                      className={cn(
                        "font-mono text-xl font-medium tabular sm:text-2xl",
                        disabled && "text-muted-foreground",
                      )}
                    >
                      {t.symbol}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{t.name}</div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {disabled ? (
                    <p className="text-sm text-muted-foreground">
                      Needs oracle, custody and legal review.
                    </p>
                  ) : (
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
                      <dt className="text-muted-foreground whitespace-nowrap">Max LTV</dt>
                      <dd className="text-right font-mono tabular">{t.ltv}</dd>
                      <dt className="text-muted-foreground whitespace-nowrap">Liq. threshold</dt>
                      <dd className="text-right font-mono tabular">{t.threshold}</dd>
                    </dl>
                  )}
                  <StatusBadge status={t.status} className="w-fit" />
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </section>
  );
}
