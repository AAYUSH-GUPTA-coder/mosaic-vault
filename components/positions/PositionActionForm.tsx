"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { AmountInput } from "@/components/transactions/AmountInput";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { TxFlow } from "@/components/transactions/TxFlow";
import { HealthBadge, healthTone } from "@/components/dashboard/HealthBadge";
import { useTxFlow } from "@/hooks/useTxFlow";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { usePool } from "@/hooks/usePool";
import { contracts } from "@/lib/blockchain/contracts";
import { MUSD_META, ZERO_INTEREST_NOTE } from "@/lib/blockchain/config";
import { formatBps, formatHealthFactor, formatPrice18, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { parseAmount } from "@/lib/validation/amount";
import { ACTION_LABEL, planAction, type PositionAction } from "@/lib/oracle/preview";
import { maxWithdrawable } from "@/lib/oracle/math";
import { addCollateral, borrow, repay, withdrawCollateral } from "@/lib/blockchain/writes";
import type { MosaicAsset, PositionView } from "@/types/mosaic";

interface Props {
  action: PositionAction;
  asset: MosaicAsset;
  position: PositionView;
  onDone?: () => void;
  /** Extra content under the amount field (e.g. faucet button). */
  extra?: React.ReactNode;
}

/**
 * Form -> review -> approve (if needed) -> submit -> pending -> confirmed/reverted.
 * All derived numbers come from lib/oracle/math (same formulas as MosaicMath), never floats.
 */
export function PositionActionForm({ action, asset, position, onDone, extra }: Props) {
  const { address } = useAccount();
  const flow = useTxFlow();
  const { pool } = usePool();
  const isMusd = action === "borrow" || action === "repay";
  const symbol = isMusd ? MUSD_META.symbol : asset.symbol;
  const decimals = isMusd ? MUSD_META.decimals : asset.decimals;
  const { balance: tokenBalance } = useTokenBalance(asset.address, address);
  const { balance: musdBalance } = useTokenBalance(contracts.musd.address, address);
  const [raw, setRaw] = useState("");

  const parsed = useMemo(() => (raw ? parseAmount(raw, decimals) : null), [raw, decimals]);
  const amount = parsed?.ok ? parsed.value : 0n;

  const plan = useMemo(
    () =>
      planAction({
        action,
        amount,
        asset,
        position,
        poolLiquidity: pool?.availableLiquidity,
        tokenBalance,
        musdBalance,
        enginePaused: pool?.paused,
      }),
    [action, amount, asset, position, pool, tokenBalance, musdBalance],
  );

  const max: bigint | null = (() => {
    switch (action) {
      case "add":
        return tokenBalance ?? null;
      case "borrow":
        return position.availableToBorrow;
      case "repay": {
        const b = musdBalance ?? 0n;
        return b < position.debt ? b : position.debt;
      }
      case "withdraw":
        return maxWithdrawable({
          collateral: position.collateral,
          debt: position.debt,
          tokenDecimals: asset.decimals,
          price: asset.price.price,
          priceDecimals: asset.price.decimals,
          maxLtvBps: asset.config.maxLtvBps,
          liqThresholdBps: asset.config.liquidationThresholdBps,
        });
    }
  })();
  const maxLabel = action === "add" ? "Wallet" : action === "borrow" ? "Borrowing limit" : action === "repay" ? "Repayable" : "Withdrawable";

  const inputError = raw && parsed && !parsed.ok ? parsed.message : null;
  const blocked = !raw ? "Enter an amount to see the review." : inputError ? inputError : plan.blocked;

  const approval =
    action === "add"
      ? { token: asset.address, spender: contracts.engine.address, amount }
      : action === "repay"
        ? { token: contracts.musd.address, spender: contracts.engine.address, amount: plan.applied }
        : undefined;

  const approvalNote =
    action === "add"
      ? `You approve the lending engine to move ${symbol}, then deposit. Two wallet confirmations the first time.`
      : action === "repay"
        ? "You approve the lending engine to move MUSD, then repay. Two wallet confirmations the first time."
        : undefined;

  const confirm = () =>
    flow.execute({
      approval,
      write: (ctx) => {
        switch (action) {
          case "add":
            return addCollateral(ctx, asset.address, amount);
          case "borrow":
            return borrow(ctx, asset.address, amount);
          case "repay":
            return repay(ctx, asset.address, plan.applied);
          case "withdraw":
            return withdrawCollateral(ctx, asset.address, amount);
        }
      },
    });

  const usdOfAmount = action === "add" || action === "withdraw" ? plan.next.collateralValueUsd - plan.current.collateralValueUsd : amount;
  const tone = healthTone(plan.next.healthFactor, plan.next.debt);

  return (
    <TxFlow
      {...flow}
      confirmLabel={ACTION_LABEL[action]}
      onConfirm={confirm}
      onBack={flow.reset}
      onDone={() => {
        flow.reset();
        setRaw("");
        onDone?.();
      }}
      approvalNote={approvalNote}
      blocked={blocked}
    >
      <AmountInput
        label={ACTION_LABEL[action]}
        symbol={symbol}
        decimals={decimals}
        value={raw}
        onChange={setRaw}
        max={max}
        maxLabel={maxLabel}
        error={inputError}
        disabled={flow.busy}
        hint={
          amount > 0n && (action === "add" || action === "withdraw")
            ? `About ${formatUsd18(usdOfAmount < 0n ? -usdOfAmount : usdOfAmount)} at the current oracle price`
            : isMusd
              ? ZERO_INTEREST_NOTE
              : undefined
        }
      />
      {extra}
      {asset.isNative && action === "add" ? (
        <p className="text-xs text-muted-foreground">Depositing BTC moves native BTC through its ERC-20 precompile. Gas is also paid in BTC, so keep some in your wallet.</p>
      ) : null}

      <ReviewList>
        <ReviewRow label="Collateral" from={`${formatTokenAmount(plan.current.collateral, asset.decimals)} ${asset.symbol}`} to={`${formatTokenAmount(plan.next.collateral, asset.decimals)} ${asset.symbol}`} />
        <ReviewRow label="Collateral value" from={formatUsd18(plan.current.collateralValueUsd)} to={formatUsd18(plan.next.collateralValueUsd)} />
        <ReviewRow label="Debt" hint={ZERO_INTEREST_NOTE} from={formatUsd18(plan.current.debt)} to={formatUsd18(plan.next.debt)} />
        <ReviewRow label="Loan-to-value" hint={`Max ${formatBps(asset.config.maxLtvBps, 0)}`} from={formatBps(plan.current.currentLtvBps)} to={formatBps(plan.next.currentLtvBps)} tone={plan.next.withinMaxLtv ? undefined : "risk"} />
        <ReviewRow label="Health factor" hint="How far the position is from liquidation" from={formatHealthFactor(plan.current.healthFactor)} to={<HealthBadge hf={plan.next.healthFactor} debt={plan.next.debt} />} tone={tone} />
        <ReviewRow label="Liquidation price" hint={`${asset.symbol} price at which the position can be liquidated`} from={plan.current.debt > 0n ? formatPrice18(plan.current.liquidationPrice) : "--"} to={plan.next.debt > 0n ? formatPrice18(plan.next.liquidationPrice) : "--"} />
      </ReviewList>
    </TxFlow>
  );
}
