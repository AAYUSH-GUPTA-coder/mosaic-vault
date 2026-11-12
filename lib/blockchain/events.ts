import { parseAbiItem, type Address, type Log, type PublicClient } from "viem";
import { contracts } from "./contracts";
import { mosaicConfig } from "./config";
import type { TxHistoryItem, TxHistoryKind } from "@/types/mosaic";

/** Mezo RPC caps eth_getLogs at 9,999 blocks per request. */
export const MAX_LOG_WINDOW = 9_000n;

const engineEvents = {
  PositionOpened: parseAbiItem("event PositionOpened(address indexed user, address indexed asset)"),
  CollateralAdded: parseAbiItem("event CollateralAdded(address indexed user, address indexed asset, uint256 amount, uint256 newCollateral)"),
  CollateralWithdrawn: parseAbiItem("event CollateralWithdrawn(address indexed user, address indexed asset, address indexed to, uint256 amount, uint256 newCollateral)"),
  Borrowed: parseAbiItem("event Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 newDebt)"),
  Repaid: parseAbiItem("event Repaid(address indexed user, address indexed asset, address indexed payer, uint256 amount, uint256 newDebt)"),
  PositionLiquidated: parseAbiItem("event PositionLiquidated(address indexed user, address indexed asset, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized, uint256 badDebt)"),
} as const;

export type EngineEventName = keyof typeof engineEvents;

/** Split [from, to] into windows of at most MAX_LOG_WINDOW blocks (inclusive bounds). */
export function blockWindows(from: bigint, to: bigint, size: bigint = MAX_LOG_WINDOW): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  if (to < from) return out;
  let start = from;
  while (start <= to) {
    const end = start + size - 1n < to ? start + size - 1n : to;
    out.push([start, end]);
    start = end + 1n;
  }
  return out;
}

type AnyArgs = Record<string, unknown>;

function toItem(name: EngineEventName, log: Log<bigint, number, false> & { args?: AnyArgs }): TxHistoryItem {
  const args = (log.args ?? {}) as AnyArgs;
  const g = (k: string) => (typeof args[k] === "bigint" ? (args[k] as bigint) : null);
  let amount: bigint | null = null;
  let secondary: bigint | null = null;
  switch (name) {
    case "CollateralAdded":
    case "CollateralWithdrawn":
      amount = g("amount");
      secondary = g("newCollateral");
      break;
    case "Borrowed":
    case "Repaid":
      amount = g("amount");
      secondary = g("newDebt");
      break;
    case "PositionLiquidated":
      amount = g("debtRepaid");
      secondary = g("collateralSeized");
      break;
    default:
      break;
  }
  return {
    id: `${log.transactionHash}:${log.logIndex}`,
    kind: name as TxHistoryKind,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    timestamp: null,
    wallet: (args.user as Address | undefined) ?? null,
    asset: (args.asset as Address | undefined) ?? null,
    amount,
    secondary,
    source: "rpc",
  };
}

export interface FetchHistoryOptions {
  wallet?: Address;
  asset?: Address;
  fromBlock?: bigint;
  toBlock?: bigint;
  /** Only scan this many most-recent blocks when no deploy block is configured. */
  lookback?: bigint;
  /** Resolve block timestamps (one eth_getBlock per unique block). */
  withTimestamps?: boolean;
}

/**
 * Wallet history fallback via getLogs over <= 9,000-block windows (newest first).
 * Used when GET /api/events returns source "unconfigured" or errors.
 */
export async function fetchEngineHistory(client: PublicClient, opts: FetchHistoryOptions = {}): Promise<TxHistoryItem[]> {
  const latest = opts.toBlock ?? (await client.getBlockNumber());
  const lookback = opts.lookback ?? 90_000n;
  const configured = mosaicConfig.deployBlock > 0n ? mosaicConfig.deployBlock : latest > lookback ? latest - lookback : 0n;
  const from = opts.fromBlock ?? configured;
  const windows = blockWindows(from, latest).reverse();
  const items: TxHistoryItem[] = [];
  const names = Object.keys(engineEvents) as EngineEventName[];
  for (const [start, end] of windows) {
    const perEvent = await Promise.all(
      names.map(async (name) => {
        const logs = await client.getLogs({
          address: contracts.engine.address,
          event: engineEvents[name],
          args: opts.wallet || opts.asset ? { user: opts.wallet, asset: opts.asset } : undefined,
          fromBlock: start,
          toBlock: end,
        });
        return logs.map((l) => toItem(name, l as unknown as Log<bigint, number, false> & { args?: AnyArgs }));
      }),
    );
    items.push(...perEvent.flat());
  }
  items.sort((a, b) => (a.blockNumber === b.blockNumber ? b.logIndex - a.logIndex : a.blockNumber > b.blockNumber ? -1 : 1));
  if (opts.withTimestamps && items.length) {
    const blocks = [...new Set(items.map((i) => i.blockNumber))].slice(0, 40);
    const stamps = new Map<bigint, number>();
    await Promise.all(
      blocks.map(async (bn) => {
        try {
          const b = await client.getBlock({ blockNumber: bn });
          stamps.set(bn, Number(b.timestamp));
        } catch {
          // leave null
        }
      }),
    );
    for (const it of items) it.timestamp = stamps.get(it.blockNumber) ?? null;
  }
  return items;
}

/** All PositionOpened (user, asset) pairs: the liquidation scanner's candidate list. */
export async function fetchOpenedPositions(client: PublicClient, opts: { fromBlock?: bigint; lookback?: bigint } = {}): Promise<Array<{ user: Address; asset: Address }>> {
  const items = await fetchEngineHistory(client, { ...opts });
  const seen = new Set<string>();
  const out: Array<{ user: Address; asset: Address }> = [];
  for (const it of items) {
    if (it.kind !== "PositionOpened" || !it.wallet || !it.asset) continue;
    const key = `${it.wallet.toLowerCase()}:${it.asset.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ user: it.wallet, asset: it.asset });
  }
  return out;
}
