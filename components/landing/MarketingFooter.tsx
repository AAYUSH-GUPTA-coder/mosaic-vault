import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { Container } from "@/components/landing/Container";
import { deployedContracts, shortAddress } from "@/components/layout/ContractLinks";

const product = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/collateral", label: "Collateral" },
  { href: "/deposit", label: "Deposit" },
  { href: "/borrow", label: "Borrow" },
];

const mezo = [
  { href: "https://testnet.mezo.org", label: "Mezo testnet app" },
  { href: "https://explorer.test.mezo.org", label: "Explorer" },
  { href: "https://faucet.test.mezo.org", label: "Faucet" },
  { href: "https://mezo.org/docs", label: "Docs" },
];

const linkClass =
  "text-[15px] text-muted-foreground transition-colors duration-150 hover:text-foreground";

export function MarketingFooter() {
  const contracts = deployedContracts();
  return (
    <footer className="border-t border-border">
      <Container className="py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <Logo size={22} />
            <p className="mt-4 max-w-sm text-[15px] text-muted-foreground">
              A lending layer on Mezo. Deposit collateral into an isolated vault
              and borrow MUSD from a funded pool.
            </p>
          </div>
          <nav aria-label="Product">
            <h2 className="text-sm font-semibold">Product</h2>
            <ul className="mt-3 space-y-2">
              {product.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={linkClass}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Mezo">
            <h2 className="text-sm font-semibold">Mezo</h2>
            <ul className="mt-3 space-y-2">
              {mezo.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer" className={linkClass}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Contracts">
            <h2 className="text-sm font-semibold">Testnet contracts</h2>
            <ul className="mt-3 space-y-2">
              {contracts.length === 0 ? (
                <li className="text-[15px] text-muted-foreground">Not deployed yet</li>
              ) : (
                contracts.map((c) => (
                  <li key={c.key}>
                    <a href={c.href} target="_blank" rel="noreferrer" className={linkClass} title={c.address}>
                      {c.label} <span className="font-mono text-[13px]">{shortAddress(c.address)}</span>
                    </a>
                  </li>
                ))
              )}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl">
            Mosaic Vault is a testnet MVP. The contracts are not audited. Test
            tokens have no value. Nothing on this site is financial advice.
          </p>
          <p className="font-mono tabular whitespace-nowrap">Mezo Testnet, chain ID 31611</p>
        </div>
      </Container>
    </footer>
  );
}
