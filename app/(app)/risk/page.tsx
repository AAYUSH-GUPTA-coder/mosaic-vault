import type { Metadata } from "next";
import { RiskView } from "@/components/risk/RiskView";

export const metadata: Metadata = { title: "Risk" };

export default function Page() {
  return <RiskView />;
}
