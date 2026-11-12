import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";

const holders = [
  {
    who: "People holding BTC",
    today: "Sell to get dollars, and give up the position.",
    after: "Keep the BTC in a vault and borrow MUSD against it.",
  },
  {
    who: "Treasuries holding stablecoins",
    today: "Idle balances with no route into Mezo's MUSD liquidity.",
    after: "Post them as lower-risk collateral with their own parameters.",
  },
  {
    who: "Holders of tokenized assets",
    today: "No on-chain way to borrow against them.",
    after: "Planned, not enabled. Needs an oracle, custody and legal review first.",
  },
];

export function Problem() {
  return (
    <section id="problem" className="border-b border-border">
      <Container className="py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
            Holding an asset should not mean sitting out.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Mezo issues MUSD, a stablecoin backed by Bitcoin. Today, getting to
            that liquidity means selling what you hold or going through Mezo&apos;s
            own BTC troves. Mosaic Vault adds a lending layer so BTC, stablecoins
            and, later, tokenized assets can back a MUSD loan instead.
          </p>
        </Reveal>

        <Reveal className="mt-12">
          <div className="hidden grid-cols-[1fr_1.2fr_1.2fr] gap-6 border-b border-border pb-3 text-sm text-muted-foreground md:grid">
            <div>Who</div>
            <div>Today</div>
            <div>With Mosaic Vault</div>
          </div>
          <ul>
            {holders.map((h) => (
              <li
                key={h.who}
                className="grid gap-2 border-b border-border py-5 md:grid-cols-[1fr_1.2fr_1.2fr] md:gap-6"
              >
                <h3 className="text-base font-semibold">{h.who}</h3>
                <p className="text-muted-foreground">
                  <span className="mr-2 text-sm font-medium text-foreground md:hidden">Today:</span>
                  {h.today}
                </p>
                <p className="text-foreground">
                  <span className="mr-2 text-sm font-medium md:hidden">With Mosaic Vault:</span>
                  {h.after}
                </p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
