import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DepositView } from "@/components/positions/DepositView";

export const metadata: Metadata = { title: "Deposit" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <DepositView />
    </Suspense>
  );
}
