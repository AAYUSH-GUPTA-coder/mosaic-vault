"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatUsd18 } from "@/lib/blockchain/formatters";
import type { PortfolioEntry } from "@/hooks/usePortfolio";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

/**
 * Collateral allocation by USD value from chain data. Recharts needs JS numbers for geometry only;
 * labels still come from the bigint values. Whole-dollar precision is enough for an angle.
 */
export function AllocationDonut({ entries }: { entries: PortfolioEntry[] }) {
  const rows = entries
    .filter((e) => e.position.collateralValueUsd > 0n)
    .map((e) => ({
      name: e.asset.symbol,
      kind: e.asset.kind,
      usd18: e.position.collateralValueUsd,
      value: Number(e.position.collateralValueUsd / 10n ** 16n) / 100,
    }));
  const total = rows.reduce((acc, r) => acc + r.usd18, 0n);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Deposit collateral to see how it is split across assets.</p>;
  }

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius={56} outerRadius={80} paddingAngle={2} stroke="var(--card)" isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={r.name} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(_v, _n, item) => {
                const usd18 = (item?.payload as { usd18?: bigint } | undefined)?.usd18;
                return [formatUsd18(usd18 ?? 0n), "Collateral value"];
              }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, color: "var(--foreground)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full divide-y divide-border text-sm">
        {rows.map((r, i) => (
          <li key={r.name} className="flex items-center justify-between py-2">
            <span className="inline-flex items-center gap-2">
              <span className="size-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} aria-hidden />
              {r.name}
              {r.kind === "test_only" ? <span className="text-xs text-muted-foreground">test-only</span> : null}
            </span>
            <span className="font-mono tabular-nums">
              {formatUsd18(r.usd18)} <span className="text-muted-foreground">({total > 0n ? `${((r.usd18 * 10_000n) / total / 100n).toString()}%` : "0%"})</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
