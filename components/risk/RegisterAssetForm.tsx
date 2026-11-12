"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Address } from "viem";
import { parseUnits } from "viem";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TxFlow } from "@/components/transactions/TxFlow";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { useTxFlow } from "@/hooks/useTxFlow";
import { registerAssetSchema, type RegisterAssetInput } from "@/lib/validation/risk";
import { percentToBps } from "@/lib/validation/amount";
import { addCollateralAsset, updateCollateralParameters } from "@/lib/blockchain/writes";
import { mosaicConfig } from "@/lib/blockchain/config";
import { formatBps } from "@/lib/blockchain/formatters";
import { Field, TextInput } from "./fields";
import type { MosaicAsset } from "@/types/mosaic";

const MUSD_DEC = 18;

/** Register a new asset, or (with `existing`) update its parameters. RHF + Zod; amounts parsed with parseUnits. */
export function RegisterAssetForm({ existing, disabled }: { existing?: MosaicAsset; disabled?: boolean }) {
  const flow = useTxFlow();
  const form = useForm<RegisterAssetInput>({
    resolver: zodResolver(registerAssetSchema),
    defaultValues: existing
      ? {
          token: existing.address,
          oracle: existing.config.oracle,
          kind: String(existing.config.kind) as "0" | "1",
          params: {
            maxLtv: String(existing.config.maxLtvBps / 100),
            liquidationThreshold: String(existing.config.liquidationThresholdBps / 100),
            liquidationPenalty: String(existing.config.liquidationPenaltyBps / 100),
            borrowCap: formatPlain(existing.config.borrowCap, MUSD_DEC),
            maxExposure: formatPlain(existing.config.maxExposure, existing.decimals),
            minDeposit: formatPlain(existing.config.minDeposit, existing.decimals),
          },
        }
      : { token: "", oracle: mosaicConfig.addresses.oracle || "", kind: "0", params: { maxLtv: "60", liquidationThreshold: "70", liquidationPenalty: "8", borrowCap: "500", maxExposure: "", minDeposit: "" } },
  });
  const { register, handleSubmit, control, setValue, formState: { errors } } = form;
  const v = useWatch({ control });
  const tokenDecimals = existing?.decimals ?? 18;

  const onConfirm = handleSubmit((data) => {
    const p = {
      token: data.token as Address,
      maxLtvBps: percentToBps(data.params.maxLtv)!,
      liquidationThresholdBps: percentToBps(data.params.liquidationThreshold)!,
      liquidationPenaltyBps: percentToBps(data.params.liquidationPenalty)!,
      borrowCap: parseUnits(data.params.borrowCap, MUSD_DEC),
      maxExposure: parseUnits(data.params.maxExposure, tokenDecimals),
      minDeposit: parseUnits(data.params.minDeposit, tokenDecimals),
    };
    void flow.execute({
      write: (ctx) => (existing ? updateCollateralParameters(ctx, p) : addCollateralAsset(ctx, { ...p, oracle: data.oracle as Address, kind: Number(data.kind) as 0 | 1 })),
    });
  });

  const ltv = percentToBps(v.params?.maxLtv ?? "");
  const liq = percentToBps(v.params?.liquidationThreshold ?? "");
  const pen = percentToBps(v.params?.liquidationPenalty ?? "");

  return (
    <TxFlow {...flow} confirmLabel={existing ? "Update parameters" : "Register asset"} onConfirm={() => void onConfirm()} onBack={flow.reset} onDone={flow.reset} blocked={disabled ? "Connect a wallet with RISK_MANAGER_ROLE to use this." : null}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Token address" error={errors.token?.message} className="sm:col-span-2" id="ra-token">
          <TextInput id="ra-token" mono placeholder="0x…" readOnly={Boolean(existing)} {...register("token")} />
        </Field>
        {!existing ? (
          <>
            <Field label="Oracle adapter" error={errors.oracle?.message} hint="ChainlinkFeedOracleAdapter for real feeds, TestPriceOracle for test-only assets" id="ra-oracle">
              <TextInput id="ra-oracle" mono placeholder="0x…" {...register("oracle")} />
            </Field>
            <Field label="Kind" error={errors.kind?.message}>
              <Select value={v.kind} onValueChange={(k) => setValue("kind", k as "0" | "1")}>
                <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Verified external</SelectItem>
                  <SelectItem value="1">Test-only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </>
        ) : null}
        <Field label="Max LTV (%)" error={errors.params?.maxLtv?.message} id="ra-ltv">
          <TextInput id="ra-ltv" mono inputMode="decimal" {...register("params.maxLtv")} />
        </Field>
        <Field label="Liquidation threshold (%)" error={errors.params?.liquidationThreshold?.message} hint="At most 95%, above max LTV" id="ra-liq">
          <TextInput id="ra-liq" mono inputMode="decimal" {...register("params.liquidationThreshold")} />
        </Field>
        <Field label="Liquidation penalty (%)" error={errors.params?.liquidationPenalty?.message} hint="At most 30%" id="ra-pen">
          <TextInput id="ra-pen" mono inputMode="decimal" {...register("params.liquidationPenalty")} />
        </Field>
        <Field label="Borrow cap (MUSD)" error={errors.params?.borrowCap?.message} id="ra-cap">
          <TextInput id="ra-cap" mono inputMode="decimal" {...register("params.borrowCap")} />
        </Field>
        <Field label={`Max exposure (${existing?.symbol ?? "token units"})`} error={errors.params?.maxExposure?.message} id="ra-exp">
          <TextInput id="ra-exp" mono inputMode="decimal" {...register("params.maxExposure")} />
        </Field>
        <Field label={`Min deposit (${existing?.symbol ?? "token units"})`} error={errors.params?.minDeposit?.message} id="ra-min">
          <TextInput id="ra-min" mono inputMode="decimal" {...register("params.minDeposit")} />
        </Field>
      </div>
      {!existing ? <p className="text-xs text-muted-foreground">Token decimals are read from the token. Amounts above use 18 decimals for MUSD and the token&apos;s own decimals for exposure and minimum deposit (18 assumed here until registered).</p> : null}
      <ReviewList>
        <ReviewRow label="Max LTV" to={ltv !== null ? formatBps(ltv) : "--"} />
        <ReviewRow label="Liquidation threshold" to={liq !== null ? formatBps(liq) : "--"} tone={ltv !== null && liq !== null && ltv >= liq ? "risk" : undefined} />
        <ReviewRow label="Liquidation penalty" to={pen !== null ? formatBps(pen) : "--"} />
      </ReviewList>
    </TxFlow>
  );
}

function formatPlain(value: bigint, decimals: number): string {
  const s = value.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}
