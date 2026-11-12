import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { StatusBadge, type AssetStatus } from "@/components/landing/StatusBadge";

const assets: {
  symbol: string;
  name: string;
  status: AssetStatus;
  body: string;
  facts: string[];
}[] = [
  {
    symbol: "BTC",
    name: "Mezo testnet BTC",
    status: "verified",
    body: "Real testnet BTC through Mezo's ERC-20 precompile. Priced by the on-chain BTC/USD feed, which updates every few seconds.",
    facts: ["18 decimals", "Chainlink-style feed", "Max staleness 900s"],
  },
  {
    symbol: "tWBTC",
    name: "Mosaic test wrapped BTC",
    status: "test",
    body: "A test token with no value, minted by the team. Its price is set by an admin so the team can show decimal handling and a controlled liquidation. It is not WBTC.",
    facts: ["8 decimals", "Admin-set price", "Team-minted"],
  },
  {
    symbol: "tUSD",
    name: "Mosaic test stablecoin",
    status: "test",
    body: "A test stablecoin priced at 1.00, minted by the team. It exists to show a second collateral type with its own, lower-risk parameters.",
    facts: ["6 decimals", "Admin-set price", "Team-minted"],
  },
  {
    symbol: "RWA",
    name: "Tokenized real-world assets",
    status: "disabled",
    body: "Listed so the direction is clear, but not enabled. Enabling it needs a price oracle, custody arrangements and legal review.",
    facts: [],
  },
];

export function SupportedAssets() {
  return (
    <section id="assets" className="border-b border-border">
      <Container className="py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Supported collateral</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            One verified asset, two test tokens, and one that is not enabled yet.
            The label on each one tells you which is which.
          </p>
        </Reveal>

        <ul className="mt-12">
          {assets.map((a) => (
            <Reveal
              as="li"
              key={a.symbol}
              className="grid gap-3 border-t border-border py-6 md:grid-cols-[10rem_1fr_auto] md:gap-8"
            >
              <div>
                <div className="font-mono text-xl font-medium tabular">{a.symbol}</div>
                <div className="text-sm text-muted-foreground">{a.name}</div>
              </div>
              <div>
                <p className="max-w-prose text-muted-foreground">{a.body}</p>
                {a.facts.length ? (
                  <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
                    {a.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <StatusBadge status={a.status} className="w-fit md:justify-self-end" />
            </Reveal>
          ))}
        </ul>
      </Container>
    </section>
  );
}
