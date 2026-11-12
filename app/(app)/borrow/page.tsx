import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BorrowView } from "@/components/positions/BorrowView";

export const metadata: Metadata = { title: "Borrow" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <BorrowView />
    </Suspense>
  );
}
