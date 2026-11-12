"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import { Button } from "@/components/ui/button";
import { TxFlow } from "@/components/transactions/TxFlow";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { useTxFlow } from "@/hooks/useTxFlow";
import { testOracleSetInvalid, testOracleSetPrice } from "@/lib/blockchain/writes";
import { formatPrice18 } from "@/lib/blockchain/formatters";
import { parseAmount } from "@/lib/validation/amount";
import { Field, TextInput } from "./fields";
import type { MosaicAsset } from "@/types/mosaic";

/** TestPriceOracle.setPrice / setInvalid for test-only assets. Clearly a demo control, never market data. */
export function TestOracleForm({ assets, disabled }: { assets: MosaicAsset[]; disabled?: boolean }) {
  const testAssets = assets.filter((a) => a.kind === "test_only");
  const flow = useTxFlow();
  const [token, setToken] = useState("");
  const [price, setPrice] = useState("");
  const [mode, setMode] = useState<"price" | "invalid">("price");
  const asset = testAssets.find((a) => a.address.toLowerCase() === token.toLowerCase());
  const decimals = asset?.price.decimals ?? 8;
  const parsed = price ? parseAmount(price, decimals) : null;
  const value = parsed?.ok ? parsed.value : 0n;
  const invalidNow = asset ? !asset.price.valid : false;

  const blocked = disabled
    ? "Connect a wallet with ORACLE_MANAGER_ROLE on the test oracle to use this."
    : !asset
      ? "Choose a test-only asset."
      : mode === "price" && !parsed
        ? "Enter a price."
        : mode === "price" && parsed && !parsed.ok
          ? parsed.message
          : null;

  const onConfirm = () =>
    flow.execute({
      write: (ctx) =>
        mode === "price"
          ? testOracleSetPrice(ctx, asset!.config.oracle, asset!.address, value, decimals)
          : testOracleSetInvalid(ctx, asset!.config.oracle, asset!.address, !invalidNow),
    });

  return (
    <TxFlow {...flow} confirmLabel={mode === "price" ? "Set test price" : invalidNow ? "Mark price valid again" : "Mark price invalid"} onConfirm={onConfirm} onBack={flow.reset} onDone={() => { flow.reset(); setPrice(""); }} blocked={blocked}>
      <AssetSelect assets={testAssets} value={token} onChange={setToken} label="Test-only asset" />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant={mode === "price" ? "default" : "outline"} onClick={() => setMode("price")}>Set price</Button>
        <Button type="button" size="sm" variant={mode === "invalid" ? "default" : "outline"} onClick={() => setMode("invalid")}>Force invalid</Button>
      </div>
      {mode === "price" ? (
        <Field label={`New price (USD, ${decimals} decimals)`} id="to-price" hint="Lower it below the liquidation price of a test position to demo a liquidation.">
          <TextInput id="to-price" mono inputMode="decimal" placeholder="75000" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      ) : null}
      <ReviewList>
        <ReviewRow label="Current oracle price" to={asset ? (asset.price.valid ? formatPrice18(asset.priceUsd18) : "invalid") : "--"} />
        {mode === "price" ? <ReviewRow label="New price" to={parsed?.ok ? formatPrice18(parseUnits(price, 18)) : "--"} /> : <ReviewRow label="Validity after" to={asset ? (invalidNow ? "valid" : "invalid (borrows and withdrawals blocked)") : "--"} />}
      </ReviewList>
    </TxFlow>
  );
}
