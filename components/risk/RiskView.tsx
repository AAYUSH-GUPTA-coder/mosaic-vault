"use client";

import { useState } from "react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { AssetSelect } from "@/components/collateral/AssetSelect";
import { ManagerNotice } from "./ManagerGate";
import { Section } from "./fields";
import { RegisterAssetForm } from "./RegisterAssetForm";
import { PauseAssetForm, SetOracleForm } from "./OracleAndPauseForms";
import { TestOracleForm } from "./TestOracleForm";
import { LiquidateForm } from "./LiquidateForm";
import { useMosaicAssets } from "@/hooks/useMosaicAssets";
import { useIsManager } from "@/hooks/useIsManager";
import { mosaicConfig } from "@/lib/blockchain/config";

export function RiskView() {
  const { assets } = useMosaicAssets();
  const { roles } = useIsManager();
  const [editing, setEditing] = useState("");
  const editAsset = assets.find((a) => a.address.toLowerCase() === editing.toLowerCase());
  const notManager = !roles.riskManager;

  return (
    <>
      <PageHeader title="Risk" description="Registry controls for risk managers. Every change is an on-chain transaction on Mezo Testnet." />
      <ManagerNotice />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Update parameters" description="Change LTV, thresholds and caps for a listed asset.">
          <div className="mb-4"><AssetSelect assets={assets} value={editing} onChange={setEditing} /></div>
          {editAsset ? <RegisterAssetForm key={editAsset.address} existing={editAsset} disabled={notManager} /> : <p className="text-sm text-muted-foreground">Choose an asset to load its current parameters.</p>}
        </Section>

        <Section title="Register asset" description="List a new collateral token. The oracle must already report a valid price for it.">
          <RegisterAssetForm disabled={notManager} />
        </Section>

        <Section title="Pause or unpause asset">
          <PauseAssetForm assets={assets} disabled={notManager} />
        </Section>

        <Section title="Set oracle" description="Point an asset at a different oracle adapter.">
          <SetOracleForm assets={assets} disabled={notManager} />
        </Section>

        <Section title="Test oracle price" demo description="Sets the admin price on TestPriceOracle for test-only assets. This is not market data; it exists to demo liquidations and oracle failures.">
          {mosaicConfig.addresses.testOracle ? <TestOracleForm assets={assets} disabled={!roles.oracleManager} /> : <p className="text-sm text-muted-foreground">NEXT_PUBLIC_TEST_ORACLE_ADDRESS is not set.</p>}
        </Section>

        <Section title="Liquidate a position" description="Anyone can liquidate a position whose health factor is below 1.0. Get a quote first.">
          <LiquidateForm assets={assets} />
        </Section>
      </div>
    </>
  );
}
