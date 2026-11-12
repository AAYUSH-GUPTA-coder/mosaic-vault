import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";
import { cn } from "@/lib/utils";

const params = [
  { asset: "BTC", ltv: "60%", threshold: "70%", penalty: "8%", cap: "500 MUSD", exposure: "0.5 BTC", min: "0.0001 BTC" },
  { asset: "tWBTC", ltv: "60%", threshold: "70%", penalty: "8%", cap: "500 MUSD", exposure: "10 tWBTC", min: "0.0001 tWBTC" },
  { asset: "tUSD", ltv: "70%", threshold: "80%", penalty: "5%", cap: "300 MUSD", exposure: "100,000 tUSD", min: "1 tUSD" },
];

const terms = [
  {
    term: "Max LTV",
    plain: "Your borrowing limit.",
    body: "The most you can borrow against the collateral's value. With $10,000 of BTC at 60%, the limit is $6,000.",
  },
  {
    term: "Liquidation threshold",
    plain: "Where liquidation starts.",
    body: "Always higher than max LTV, so there is a buffer between borrowing to the limit and being liquidated.",
  },
  {
    term: "Health factor",
    plain: "How far you are from that line.",
    body: "Collateral value × liquidation threshold ÷ debt. Above 1.0 is safe. Below 1.0 the position can be liquidated.",
  },
];

const bands = [
  { label: "1.50 and above", tone: "good", text: "Healthy" },
  { label: "1.10 to 1.50", tone: "warn", text: "Watch" },
  { label: "Below 1.10", tone: "risk", text: "At risk" },
  { label: "Below 1.00", tone: "risk", text: "Liquidatable" },
] as const;

const tone = {
  good: "bg-health-good-bg text-health-good",
  warn: "bg-health-warn-bg text-health-warn",
  risk: "bg-health-risk-bg text-health-risk",
};

function Row({ label, value, note, className }: { label: string; value: string; note?: string; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-2.5", className)}>
      <div>
        <div className="text-sm">{label}</div>
        {note ? <div className="text-xs text-muted-foreground">{note}</div> : null}
      </div>
      <div className="font-mono text-sm tabular whitespace-nowrap">{value}</div>
    </div>
  );
}

export function RiskModel() {
  return (
    <section id="risk-model" className="scroll-mt-20 border-b border-border">
      <Container className="py-20 sm:py-24">
        <Reveal className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">Risk model</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Every asset has its own parameters. Three numbers decide what you can
            borrow and when a position is at risk.
          </p>
        </Reveal>

        <Reveal className="mt-12 grid gap-10 lg:grid-cols-[1fr_1fr]">
          <dl className="grid gap-6">
            {terms.map((t) => (
              <div key={t.term} className="border-t border-border pt-4">
                <dt className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-lg font-semibold">{t.term}</span>
                  <span className="text-muted-foreground">{t.plain}</span>
                </dt>
                <dd className="mt-1.5 text-muted-foreground">{t.body}</dd>
              </div>
            ))}
          </dl>

          {/* Worked example, stated as a small ledger. */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-soft sm:p-6">
            <h3 className="text-base font-semibold">Worked example</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Liquidation threshold 70%. Numbers are rounded.
            </p>
            <div className="mt-4 divide-y divide-border">
              <Row label="Collateral value" value="$10,000.00" />
              <Row label="Debt" value="$6,000.00" />
              <Row label="Health factor" note="10,000 × 0.70 ÷ 6,000" value="1.17" />
              <Row label="Liquidation value" note="6,000 ÷ 0.70. Collateral value where the health factor hits 1.0." value="$8,571.43" />
            </div>
            <div className="mt-4 rounded-md bg-health-risk-bg p-4">
              <div className="text-sm font-medium text-health-risk">Price falls 20%</div>
              <div className="divide-y divide-health-risk/15">
                <Row label="Collateral value" value="$8,000.00" className="text-health-risk" />
                <Row label="Health factor" note="8,000 × 0.70 ÷ 6,000" value="0.93" className="text-health-risk" />
              </div>
              <p className="mt-2 text-sm text-health-risk">
                Below 1.0, so anyone can repay part of the debt and take collateral
                plus the 8% penalty.
              </p>
            </div>
          </div>
        </Reveal>

        <Reveal className="mt-10">
          <h3 className="text-sm font-semibold">Health factor bands in the app</h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {bands.map((b) => (
              <li
                key={b.label}
                className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm", tone[b.tone])}
              >
                <span className="font-medium">{b.text}</span>
                <span className="font-mono text-xs tabular opacity-90">{b.label}</span>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal className="mt-14">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold">Asset parameters</h3>
            <p className="text-sm text-muted-foreground">Testnet parameters, illustrative. Not production advice.</p>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-border bg-card shadow-soft">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/60 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Asset</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Max LTV</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Liq. threshold</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Liq. penalty</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Borrow cap</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Max exposure</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">Min deposit</th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr key={p.asset} className="border-t border-border">
                    <th scope="row" className="px-4 py-3 text-left font-mono font-medium">{p.asset}</th>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.ltv}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.threshold}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.penalty}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.cap}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.exposure}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">{p.min}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Borrow caps are small because the pool is funded from one testnet wallet with about 1,000 MUSD.
          </p>
        </Reveal>
      </Container>
    </section>
  );
}
