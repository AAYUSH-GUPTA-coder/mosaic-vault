"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { formatTokenAmount } from "@/lib/blockchain/formatters";
import { formatUnits } from "viem";

interface Props {
  label: string;
  symbol: string;
  decimals: number;
  value: string;
  onChange: (v: string) => void;
  /** Wallet balance or capacity shown under the field; "Max" fills it in exactly. */
  max?: bigint | null;
  maxLabel?: string;
  error?: string | null;
  hint?: React.ReactNode;
  disabled?: boolean;
}

export function AmountInput({ label, symbol, decimals, value, onChange, max, maxLabel = "Balance", error, hint, disabled }: Props) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {max !== undefined && max !== null ? (
          <span className="text-xs text-muted-foreground">
            {maxLabel}: <span className="font-mono tabular-nums text-foreground">{formatTokenAmount(max, decimals)}</span> {symbol}
          </span>
        ) : null}
      </div>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder="0.00"
          value={value}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 pr-24 font-mono text-base tabular-nums md:text-base"
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{symbol}</span>
          {max !== undefined && max !== null && max > 0n ? (
            <Button type="button" size="xs" variant="outline" disabled={disabled} onClick={() => onChange(formatUnits(max, decimals))}>
              Max
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-xs text-health-risk">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
