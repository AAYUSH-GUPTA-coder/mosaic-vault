import { mosaicConfig } from "@/lib/blockchain/config";

const CONTRACTS = [
  { key: "engine", label: "Lending engine" },
  { key: "pool", label: "Lending pool" },
  { key: "vault", label: "Collateral vault" },
  { key: "registry", label: "Collateral registry" },
  { key: "liquidationEngine", label: "Liquidation engine" },
  { key: "oracle", label: "Oracle adapter" },
] as const;

/** Deployed Mezo testnet contracts with explorer links. Empty until the addresses are configured. */
export function deployedContracts() {
  const a = mosaicConfig.addresses;
  return CONTRACTS.filter((c) => a[c.key]).map((c) => ({
    ...c,
    address: a[c.key] as string,
    href: `${mosaicConfig.explorerUrl}/address/${a[c.key]}`,
  }));
}

export function shortAddress(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
