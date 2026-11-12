import type { Metadata } from "next";
import { CollateralView } from "@/components/collateral/CollateralView";

export const metadata: Metadata = { title: "Collateral" };

export default function Page() {
  return <CollateralView />;
}
