"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { AmountInput } from "@/components/transactions/AmountInput";
import { TxFlow } from "@/components/transactions/TxFlow";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { Button } from "@/components/ui/button";
import { useTxFlow } from "@/hooks/useTxFlow";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { contracts } from "@/lib/blockchain/contracts";
import { MUSD_META } from "@/lib/blockchain/config";
import { depositLiquidity, withdrawLiquidity } from "@/lib/blockchain/writes";
import { formatUsd18 } from "@/lib/blockchain/formatters";
import { parseAmount } from "@/lib/validation/amount";
import type { PoolState } from "@/types/mosaic";

/** LIQUIDITY_PROVIDER_ROLE: deposit MUSD into / withdraw free MUSD from the pool. */
export function PoolLiquidityForm({ pool, disabled }: { pool?: PoolState; disabled?: boolean }) {
  const { address } = useAccount();
  const flow = useTxFlow();
  const [mode, setMode] = useState<"deposit" | "withdraw">("deposit");
  const [raw, setRaw] = useState("");
  const { balance } = useTokenBalance(contracts.musd.address, address);
  const parsed = raw ? parseAmount(raw, MUSD_META.decimals) : null;
  const amount = parsed?.ok ? parsed.value : 0n;
  const max = mode === "deposit" ? (balance ?? null) : (pool?.availableLiquidity ?? null);
  const blocked = disabled ? "Connect a wallet with LIQUIDITY_PROVIDER_ROLE on the pool to use this." : !parsed ? "Enter an amount." : !parsed.ok ? parsed.message : max !== null && amount > max ? (mode === "deposit" ? "That is more MUSD than your wallet holds." : "That is more than the pool's free MUSD.") : null;
  const after = pool ? (mode === "deposit" ? pool.availableLiquidity + amount : pool.availableLiquidity - amount) : null;

  return (
    <TxFlow {...flow} confirmLabel={mode === "deposit" ? "Deposit liquidity" : "Withdraw liquidity"} onConfirm={() => void flow.execute({ approval: mode === "deposit" ? { token: contracts.musd.address, spender: contracts.pool.address, amount } : undefined, write: (ctx) => (mode === "deposit" ? depositLiquidity(ctx, amount) : withdrawLiquidity(ctx, amount, address!)) })} onBack={flow.reset} onDone={() => { flow.reset(); setRaw(""); }} blocked={blocked} approvalNote={mode === "deposit" ? "You approve the pool to pull MUSD, then deposit." : undefined}>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "deposit" ? "default" : "outline"} onClick={() => setMode("deposit")}>Deposit</Button>
        <Button type="button" size="sm" variant={mode === "withdraw" ? "default" : "outline"} onClick={() => setMode("withdraw")}>Withdraw</Button>
      </div>
      <AmountInput label={mode === "deposit" ? "MUSD to deposit" : "MUSD to withdraw"} symbol="MUSD" decimals={18} value={raw} onChange={setRaw} max={max} maxLabel={mode === "deposit" ? "Wallet" : "Free in pool"} error={raw && parsed && !parsed.ok ? parsed.message : null} />
      <ReviewList>
        <ReviewRow label="Pool free MUSD" from={pool ? formatUsd18(pool.availableLiquidity) : "--"} to={after !== null && after >= 0n ? formatUsd18(after) : "--"} />
      </ReviewList>
    </TxFlow>
  );
}
