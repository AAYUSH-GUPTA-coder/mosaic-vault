import { ArrowDown, ArrowRight } from "lucide-react";
import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";

const steps = [
  {
    title: "Deposit into an isolated vault",
    body: "Pick one asset. Your deposit becomes its own position, separate from anything else you deposit. You approve a single contract, the lending engine, and it moves the tokens into the collateral vault.",
    chain: "MosaicLendingEngine.addCollateral → CollateralVault",
  },
  {
    title: "Borrow MUSD from a funded pool",
    body: "Borrow up to your limit: collateral value times the asset's max LTV. The MUSD comes from a pool that liquidity providers filled. Nothing is minted.",
    chain: "MosaicLendingEngine.borrow → MosaicLendingPool.lendToBorrower",
  },
  {
    title: "Monitor the health factor",
    body: "Health factor: how far the position is from liquidation. Above 1.0 it is safe. Below 1.0, anyone can repay part of the debt and take collateral plus a penalty.",
    chain: "getPositionView(user, asset).healthFactor",
  },
  {
    title: "Repay and withdraw",
    body: "Repay any amount at any time, even while the protocol is paused. Withdraw collateral whenever the position stays above its limits. Interest is 0% in this MVP, so you repay exactly what you borrowed.",
    chain: "repay → withdrawCollateral",
  },
];

function Box({
  title,
  sub,
  mono,
  className,
}: {
  title: string;
  sub: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={"rounded-lg border border-border bg-card p-4 shadow-soft " + (className ?? "")}>
      <div className={mono ? "font-mono text-sm font-medium" : "text-sm font-semibold"}>{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-b border-border">
      <Container className="py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">How it works</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            One contract to approve, one position per asset, one pool of MUSD.
          </p>
        </Reveal>

        {/* Contract flow. Boxes and arrows only; every box is a real contract. */}
        <Reveal className="mt-12">
          <div
            className="grid items-center gap-3 md:grid-cols-[1fr_auto_1.2fr_auto_1fr]"
            role="img"
            aria-label="Your wallet approves the lending engine. The engine moves collateral into the collateral vault and MUSD out of the lending pool."
          >
            <Box title="Your wallet" sub="Approves one contract: the lending engine." />
            <ArrowDown className="mx-auto size-4 text-muted-foreground md:hidden" aria-hidden="true" />
            <ArrowRight className="hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
            <Box
              title="MosaicLendingEngine"
              sub="The single entry point. Deposit, borrow, repay, withdraw. It is the only contract that can move balances."
              mono
            />
            <ArrowDown className="mx-auto size-4 text-muted-foreground md:hidden" aria-hidden="true" />
            <ArrowRight className="hidden size-4 text-muted-foreground md:block" aria-hidden="true" />
            <div className="grid gap-3">
              <Box title="CollateralVault" sub="Holds your collateral, per user and per asset." mono />
              <Box title="MosaicLendingPool" sub="Holds the MUSD that gets lent out." mono />
            </div>
          </div>
        </Reveal>

        <ol className="mt-14 grid gap-px overflow-hidden rounded-lg border border-border bg-border">
          {steps.map((s, i) => (
            <Reveal as="li" key={s.title} className="grid gap-4 bg-background p-5 sm:grid-cols-[3rem_1fr] sm:p-6">
              <div className="font-mono text-2xl text-muted-foreground tabular" aria-hidden="true">
                {i + 1}
              </div>
              <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,22rem)] lg:gap-10">
                <div>
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <p className="mt-2 text-muted-foreground">{s.body}</p>
                </div>
                <p className="self-start rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed break-words text-muted-foreground">
                  {s.chain}
                </p>
              </div>
            </Reveal>
          ))}
        </ol>
      </Container>
    </section>
  );
}
