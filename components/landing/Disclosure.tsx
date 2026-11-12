import { Container } from "@/components/landing/Container";
import { Reveal } from "@/components/landing/Reveal";

const points = [
  "This is a testnet MVP on Mezo Testnet (chain ID 31611). No real funds are involved.",
  "The contracts are not audited.",
  "The MUSD you borrow comes from a pool funded by the team, about 1,000 MUSD. Borrow caps are small for that reason.",
  "Mosaic Vault does not modify Mezo's native MUSD system and does not mint MUSD.",
  "Interest is 0% in this MVP. There is no yield and no APY, so none is shown.",
  "tWBTC and tUSD are test tokens with no value, priced by an admin-set oracle.",
];

export function Disclosure() {
  return (
    <section id="disclosure" className="border-b border-border">
      <Container className="py-20 sm:py-24">
        <Reveal className="rounded-lg border border-border bg-card p-6 shadow-soft sm:p-8">
          <h2 className="text-2xl font-semibold tracking-[-0.01em]">What this is, and what it is not</h2>
          <ul className="mt-6 grid gap-x-10 gap-y-3 sm:grid-cols-2">
            {points.map((p) => (
              <li key={p} className="flex gap-3 text-muted-foreground">
                <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-foreground/60" aria-hidden="true" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      </Container>
    </section>
  );
}
