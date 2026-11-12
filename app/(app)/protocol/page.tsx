import type { Metadata } from "next";
import { ProtocolView } from "@/components/risk/ProtocolView";

export const metadata: Metadata = { title: "Protocol" };

export default function Page() {
  return <ProtocolView />;
}
