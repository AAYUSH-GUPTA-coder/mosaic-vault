"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PositionActionForm } from "./PositionActionForm";
import { ACTION_LABEL, type PositionAction } from "@/lib/oracle/preview";
import type { MosaicAsset, PositionView } from "@/types/mosaic";

const DESCRIPTION: Record<PositionAction, string> = {
  add: "Adds collateral to this isolated position and raises its health factor.",
  borrow: "Borrows MUSD against this position. 0% interest in this testnet MVP.",
  repay: "Repays MUSD debt. Any amount above the debt is ignored by the contract.",
  withdraw: "Withdraws collateral. The position must stay above its maximum loan-to-value.",
};

export function PositionActionDialog({ action, asset, position, variant = "outline", disabled }: { action: PositionAction; asset: MosaicAsset; position: PositionView; variant?: "default" | "outline"; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant} disabled={disabled}>
          {ACTION_LABEL[action]}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {ACTION_LABEL[action]} · {asset.symbol}
          </DialogTitle>
          <DialogDescription>{DESCRIPTION[action]}</DialogDescription>
        </DialogHeader>
        <PositionActionForm action={action} asset={asset} position={position} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
