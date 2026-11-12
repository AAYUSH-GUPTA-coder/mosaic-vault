"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { KindBadge } from "@/components/dashboard/AssetLabel";
import type { MosaicAsset } from "@/types/mosaic";

export function AssetSelect({ assets, value, onChange, label = "Asset", disabled }: { assets: MosaicAsset[]; value?: string; onChange: (address: string) => void; label?: string; disabled?: boolean }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value ?? ""} onValueChange={onChange} disabled={disabled || assets.length === 0}>
        <SelectTrigger className="h-10 w-full">
          <SelectValue placeholder={assets.length ? "Choose an asset" : "No assets registered"} />
        </SelectTrigger>
        <SelectContent>
          {assets.map((a) => (
            <SelectItem key={a.address} value={a.address}>
              <span className="inline-flex items-center gap-2">
                <span className="font-medium">{a.symbol}</span>
                <span className="text-muted-foreground">{a.name}</span>
                <KindBadge kind={a.kind} />
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
