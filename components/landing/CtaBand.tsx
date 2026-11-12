import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/landing/Container";

export function CtaBand() {
  return (
    <section className="bg-band text-band-foreground">
      <Container className="flex flex-col gap-8 py-16 sm:py-20 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <h2 className="text-3xl font-semibold tracking-[-0.01em] sm:text-4xl">
            Open a position on Mezo Testnet.
          </h2>
          <p className="mt-4 text-lg text-band-foreground/75">
            Get testnet BTC from the faucet, then deposit and borrow in a few minutes.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-md bg-band-foreground px-5 text-base font-medium text-band transition-colors duration-150 hover:bg-band-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-foreground active:translate-y-px"
          >
            Open app
          </Link>
          <a
            href="https://faucet.test.mezo.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-band-foreground/30 px-5 text-base font-medium text-band-foreground transition-colors duration-150 hover:bg-band-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-band-foreground active:translate-y-px"
          >
            Get testnet BTC
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      </Container>
    </section>
  );
}
