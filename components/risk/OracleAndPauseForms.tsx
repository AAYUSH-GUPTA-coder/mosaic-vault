"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Address } from "viem";
import { TxFlow } from "@/components/transactions/TxFlow";
import { ReviewList, ReviewRow } from "@/components/transactions/ReviewRow";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { useTxFlow } from "@/hooks/useTxFlow";
import { setOracleSchema } from "@/lib/validation/risk";
import { pauseCollateralAsset, pauseEngine, setOracle, unpauseCollateralAsset, unpauseEngine } from "@/lib/blockchain/writes";
import { shortAddress } from "@/lib/blockchain/formatters";
import { Field, TextInput } from "./fields";
import type { MosaicAsset } from "@/types/mosaic";
import { z } from "zod";

type SetOracleInput = z.infer<typeof setOracleSchema>;

export function SetOracleForm({ assets, disabled }: { assets: MosaicAsset[]; disabled?: boolean }) {
  const flow = useTxFlow();
  const { register, handleSubmit, control, setValue, formState: { errors } } = useForm<SetOracleInput>({ resolver: zodResolver(setOracleSchema), defaultValues: { token: "", oracle: "" } });
  const v = useWatch({ control });
  const onConfirm = handleSubmit((d) => void flow.execute({ write: (ctx) => setOracle(ctx, d.token as Address, d.oracle as Address) }));
  return (
    <TxFlow {...flow} confirmLabel="Set oracle" onConfirm={() => void onConfirm()} onBack={flow.reset} onDone={flow.reset} blocked={disabled ? "Connect a wallet with RISK_MANAGER_ROLE to use this." : null}>
      <AssetSelect assets={assets} value={v.token} onChange={(a) => setValue("token", a, { shouldValidate: true })} />
      {errors.token ? <p className="-mt-2 text-xs text-health-risk">{errors.token.message}</p> : null}
      <Field label="New oracle adapter" error={errors.oracle?.message} hint="Must already report a valid price for the token" id="so-oracle">
        <TextInput id="so-oracle" mono placeholder="0x…" {...register("oracle")} />
      </Field>
      <ReviewList>
        <ReviewRow label="Token" to={v.token ? shortAddress(v.token) : "--"} />
        <ReviewRow label="Oracle" to={v.oracle ? shortAddress(v.oracle) : "--"} />
      </ReviewList>
    </TxFlow>
  );
}

export function PauseAssetForm({ assets, disabled }: { assets: MosaicAsset[]; disabled?: boolean }) {
  const flow = useTxFlow();
  const [token, setToken] = useState("");
  const asset = assets.find((a) => a.address.toLowerCase() === token.toLowerCase());
  const paused = asset?.config.status === 2;
  return (
    <TxFlow {...flow} confirmLabel={paused ? "Unpause asset" : "Pause asset"} onConfirm={() => void flow.execute({ write: (ctx) => (paused ? unpauseCollateralAsset(ctx, token as Address) : pauseCollateralAsset(ctx, token as Address)) })} onBack={flow.reset} onDone={flow.reset} blocked={disabled ? "Connect a wallet with RISK_MANAGER_ROLE to use this." : !asset ? "Choose an asset." : null}>
      <AssetSelect assets={assets} value={token} onChange={setToken} />
      <ReviewList>
        <ReviewRow label="Status now" to={asset ? (paused ? "Paused" : "Active") : "--"} />
        <ReviewRow label="After" to={asset ? (paused ? "Active" : "Paused: no new deposits or borrows; repay, withdraw and liquidate still work") : "--"} />
      </ReviewList>
    </TxFlow>
  );
}

export function PauseEngineForm({ paused, disabled }: { paused: boolean; disabled?: boolean }) {
  const flow = useTxFlow();
  return (
    <TxFlow {...flow} confirmLabel={paused ? "Unpause engine" : "Pause engine"} onConfirm={() => void flow.execute({ write: (ctx) => (paused ? unpauseEngine(ctx) : pauseEngine(ctx)) })} onBack={flow.reset} onDone={flow.reset} blocked={disabled ? "Connect a wallet with PAUSER_ROLE on the engine to use this." : null}>
      <ReviewList>
        <ReviewRow label="Engine now" to={paused ? "Paused" : "Running"} />
        <ReviewRow label="After" to={paused ? "Running" : "Paused: deposits, borrows, withdrawals and liquidations stop; repayments continue"} />
      </ReviewList>
    </TxFlow>
  );
}
