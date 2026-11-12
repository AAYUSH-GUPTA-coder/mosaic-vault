"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { Address } from "viem";
import { isAddress, parseUnits } from "viem";
import { TxFlow } from "@/components/transactions/TxFlow";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { useTxFlow } from "@/hooks/useTxFlow";
import { contracts } from "@/lib/blockchain/contracts";
import { readLiquidationQuote } from "@/lib/blockchain/reads";
import { liquidate } from "@/lib/blockchain/writes";
import { formatPrice18, formatTokenAmount, formatUsd18 } from "@/lib/blockchain/formatters";
import { parseAmount } from "@/lib/validation/amount";
import { Field, TextInput } from "./fields";
import type { MosaicAsset } from "@/types/mosaic";

interface Quote { debtToRepay: bigint; collateralToSeize: bigint; price: bigint; liquidatable: boolean }

/** Liquidate a position with an on-chain quote. Permissionless; the liquidator approves the engine for MUSD. */
export function LiquidateForm({ assets, initial }: { assets: MosaicAsset[]; initial?: { user: Address; asset: Address } }) {
  const client = usePublicClient();
  const flow = useTxFlow();
  const [user, setUser] = useState(initial?.user ?? "");
  const [token, setToken] = useState(initial?.asset ?? "");
  const [repay, setRepay] = useState("");
  const asset = assets.find((a) => a.address.toLowerCase() === token.toLowerCase());
  const parsed = repay ? parseAmount(repay, 18) : null;
  const amount = parsed?.ok ? parsed.value : 0n;

  const canQuote = Boolean(client && asset && isAddress(user) && amount > 0n);
  const { data: quote = null } = useQuery<Quote | null>({
    queryKey: ["mosaic", "liquidationQuote", user.toLowerCase(), asset?.address.toLowerCase(), amount.toString()],
    queryFn: () => readLiquidationQuote(client!, user as Address, asset!.address, amount).catch(() => null),
    enabled: canQuote,
    staleTime: 10_000,
  });

  const blocked = !isAddress(user) ? "Enter the borrower's address." : !asset ? "Choose the asset." : !parsed ? "Enter the MUSD amount to repay." : !parsed.ok ? parsed.message : quote && !quote.liquidatable ? "This position is not liquidatable. Its health factor is at or above 1.0." : null;

  return (
    <TxFlow {...flow} confirmLabel="Liquidate" onConfirm={() => void flow.execute({ approval: { token: contracts.musd.address, spender: contracts.engine.address, amount: quote?.debtToRepay ?? amount }, write: (ctx) => liquidate(ctx, user as Address, asset!.address, amount) })} onBack={flow.reset} onDone={() => { flow.reset(); setRepay(""); }} blocked={blocked} approvalNote="You approve the lending engine to pull MUSD, then the liquidation runs. Seized collateral goes to your wallet.">
      <Field label="Borrower" id="lq-user">
        <TextInput id="lq-user" mono placeholder="0x…" value={user} onChange={(e) => setUser(e.target.value)} />
      </Field>
      <AssetSelect assets={assets} value={token} onChange={setToken} />
      <Field label="MUSD to repay" id="lq-amt" hint="Capped at the position's debt by the contract.">
        <TextInput id="lq-amt" mono inputMode="decimal" placeholder="100" value={repay} onChange={(e) => setRepay(e.target.value)} />
      </Field>
      <ReviewList>
        <ReviewRow label="Debt repaid" to={quote ? formatUsd18(quote.debtToRepay) : amount > 0n ? formatUsd18(parseUnits(repay || "0", 18)) : "--"} />
        <ReviewRow label="Collateral seized" hint={asset ? `Includes the ${asset.config.liquidationPenaltyBps / 100}% penalty` : undefined} to={quote && asset ? `${formatTokenAmount(quote.collateralToSeize, asset.decimals)} ${asset.symbol}` : "--"} />
        <ReviewRow label="Oracle price" to={quote ? formatPrice18(quote.price) : "--"} />
        <ReviewRow label="Liquidatable" to={quote ? (quote.liquidatable ? "Yes" : "No") : "--"} tone={quote ? (quote.liquidatable ? "risk" : "good") : undefined} />
      </ReviewList>
    </TxFlow>
  );
}
