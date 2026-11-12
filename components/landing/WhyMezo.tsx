import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";

const facts = [
  {
    title: "MUSD is backed by Bitcoin",
    body: "Mezo's stablecoin is minted against BTC in Mezo's own system. Mosaic Vault lends MUSD that already exists; it never touches that system.",
  },
  {
    title: "Gas is paid in BTC",
    body: "Every transaction on Mezo uses native BTC for fees, so a BTC holder needs nothing else to get started.",
  },
  {
    title: "It runs the EVM",
    body: "Standard Solidity, standard wallets, standard tooling. The contracts use OpenZeppelin and compile with Solidity 0.8.28.",
  },
];

export function WhyMezo() {
  return (
    <section id="why-mezo" className="border-b border-border">
      <Container className="grid gap-10 py-20 sm:py-24 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
        <Reveal>
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Why Mezo</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            A Bitcoin-backed dollar on a chain where BTC is the gas token. That is
            the right place to put BTC to work without selling it.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Network</dt>
              <dd className="mt-0.5 font-medium">Mezo Testnet</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Chain ID</dt>
              <dd className="mt-0.5 font-mono tabular">31611</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Stablecoin</dt>
              <dd className="mt-0.5 font-medium">MUSD, 18 decimals</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Price feed</dt>
              <dd className="mt-0.5 font-medium">BTC/USD, on-chain</dd>
            </div>
          </dl>
        </Reveal>

        <Reveal>
          <ul className="divide-y divide-border border-y border-border">
            {facts.map((f) => (
              <li key={f.title} className="py-6 first:pt-0 lg:first:pt-6">
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
