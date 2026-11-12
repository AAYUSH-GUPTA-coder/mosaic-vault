import type { Metadata } from "next";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PositionDetailView } from "@/components/positions/PositionDetailView";

export const metadata: Metadata = { title: "Position" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PositionDetailView />
    </Suspense>
  );
}
