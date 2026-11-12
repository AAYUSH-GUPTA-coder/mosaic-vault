import type { Metadata } from "next";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { RiskModel } from "@/components/landing/RiskModel";
import { SupportedAssets } from "@/components/landing/SupportedAssets";
import { WhyMezo } from "@/components/landing/WhyMezo";
import { Disclosure } from "@/components/landing/Disclosure";
import { CtaBand } from "@/components/landing/CtaBand";

export const metadata: Metadata = {
  title: {
    absolute: "Mosaic Vault · More collateral. More access to Bitcoin-backed liquidity.",
  },
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      <Hero />
      <Problem />
      <HowItWorks />
      <RiskModel />
      <SupportedAssets />
      <WhyMezo />
      <Disclosure />
      <CtaBand />
    </>
  );
}
