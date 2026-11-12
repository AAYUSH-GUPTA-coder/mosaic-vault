import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  defineChain,
  http,
  parseEventLogs,
  type Abi,
  type Address,
  type Log,
  type PublicClient,
} from "viem";
import {
  collateralRegistryAbi,
  collateralVaultAbi,
  mosaicLendingEngineAbi,
  mosaicLendingPoolAbi,
  mosaicLiquidationEngineAbi,
  oracleAdapterAbi,
} from "@/lib/blockchain/abis";
import { getChainId, getContractAddresses, getDeployBlock, getRpcUrl } from "@/lib/database/env";
import {
  getCursor,
  insertSnapshots,
  setCursor,
  touchPosition,
  upsertIndexedEvents,
  upsertPositions,
  type IndexedEventInsert,
  type PositionUpsert,
  type RiskSnapshotInsert,
} from "@/lib/database/queries";

/**
 * Idempotent log indexer (docs/API.md "Indexer").
 * - one cursor per contract: key `events:${chainId}:${address}`
 * - reads logs from `last_block + 1` to `latest` in chunks of <= 9,000 blocks
 * - upserts indexed_events (ignoreDuplicates), positions on PositionOpened, then cursors
 * - afterwards takes one asset_risk_snapshots row per registered asset
 */

export const MAX_CHUNK_BLOCKS = BigInt(9000);
/** Upper bound of chunks per run so a single cron invocation stays short; the next run resumes. */
export const DEFAULT_MAX_CHUNKS_PER_RUN = 25;

export type ContractKey = "engine" | "pool" | "registry" | "liquidationEngine";

export interface IndexedContract {
  key: ContractKey;
  address: Address;
  abi: Abi;
}

export interface IndexerRunOptions {
  db: SupabaseClient;
  client?: PublicClient;
  chainId?: number;
  deployBlock?: bigint;
  contracts?: IndexedContract[];
  maxChunksPerRun?: number;
  /** Skip the snapshot phase (tests). */
  skipSnapshots?: boolean;
  /** Block-timestamp lookups are best-effort; set false to skip them entirely. */
  fetchTimestamps?: boolean;
}

export interface IndexerRunResult {
  processed: number;
  fromBlock: number;
  toBlock: number;
  snapshots: number;
}

export function makeViemClient(rpcUrl = getRpcUrl(), chainId = getChainId()): PublicClient {
  const chain = defineChain({
    id: chainId,
    name: "Mezo Testnet",
    nativeCurrency: { name: "Bitcoin", symbol: "BTC", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    testnet: true,
  });
  return createPublicClient({ chain, transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }) });
}

export function contractsFromEnv(): IndexedContract[] {
  const a = getContractAddresses();
  const list: IndexedContract[] = [];
  if (a.engine) list.push({ key: "engine", address: a.engine, abi: mosaicLendingEngineAbi as Abi });
  if (a.pool) list.push({ key: "pool", address: a.pool, abi: mosaicLendingPoolAbi as Abi });
  if (a.registry) list.push({ key: "registry", address: a.registry, abi: collateralRegistryAbi as Abi });
  if (a.liquidationEngine) {
    list.push({ key: "liquidationEngine", address: a.liquidationEngine, abi: mosaicLiquidationEngineAbi as Abi });
  }
  return list;
}

export function cursorKey(chainId: number, address: string): string {
  return `events:${chainId}:${address.toLowerCase()}`;
}

/** JSON-safe copy of decoded args (bigint -> decimal string). */
export function serializeArgs(args: unknown): Record<string, unknown> {
  const json = JSON.stringify(args ?? {}, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
  const parsed: unknown = JSON.parse(json);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { args: parsed };
}

const WALLET_KEYS = ["user", "provider", "borrower", "liquidator"] as const;
const ASSET_KEYS = ["asset", "token"] as const;

function pick(args: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = args[k];
    if (typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v)) return v.toLowerCase();
  }
  return null;
}

export interface DecodedEventRow extends IndexedEventInsert {
  positionKey: { wallet: string; asset: string } | null;
  isPositionOpened: boolean;
}

/** Decodes raw logs for one contract into rows; logs that don't match the ABI are skipped. */
export function decodeLogs(
  chainId: number,
  contract: IndexedContract,
  logs: Log[],
  timestamps: Map<bigint, string> = new Map(),
): DecodedEventRow[] {
  const parsed = parseEventLogs({ abi: contract.abi, logs, strict: false });
  const rows: DecodedEventRow[] = [];
  for (const log of parsed) {
    if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue;
    const args = serializeArgs(log.args);
    const wallet = pick(args, WALLET_KEYS);
    const asset = pick(args, ASSET_KEYS);
    const isEngine = contract.key === "engine";
    rows.push({
      chain_id: chainId,
      contract_address: contract.address.toLowerCase(),
      transaction_hash: log.transactionHash.toLowerCase(),
      block_number: Number(log.blockNumber),
      log_index: log.logIndex,
      event_name: log.eventName,
      event_payload: args,
      wallet_address: wallet,
      asset_address: asset,
      block_timestamp: timestamps.get(log.blockNumber) ?? null,
      positionKey: isEngine && wallet && asset ? { wallet, asset } : null,
      isPositionOpened: isEngine && log.eventName === "PositionOpened",
    });
  }
  return rows;
}

/** Persists decoded rows idempotently. Returns the number of rows sent (duplicates are ignored by the DB). */
export async function persistDecodedEvents(
  db: SupabaseClient,
  chainId: number,
  contractAddress: string,
  rows: DecodedEventRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  await upsertIndexedEvents(
    db,
    rows.map((r) => {
      const { positionKey: _p, isPositionOpened: _o, ...row } = r;
      void _p;
      void _o;
      return row;
    }),
  );

  const opened: PositionUpsert[] = rows
    .filter((r) => r.isPositionOpened && r.positionKey)
    .map((r) => ({
      wallet_address: r.positionKey!.wallet,
      collateral_asset: r.positionKey!.asset,
      contract_position_id: `${contractAddress.toLowerCase()}:${r.positionKey!.wallet}:${r.positionKey!.asset}`,
      chain_id: chainId,
      contract_address: contractAddress.toLowerCase(),
      first_seen_block: r.block_number,
      last_event_block: r.block_number,
    }));
  await upsertPositions(db, opened);

  const latest = new Map<string, { wallet: string; asset: string; block: number }>();
  for (const r of rows) {
    if (!r.positionKey) continue;
    const k = `${r.positionKey.wallet}:${r.positionKey.asset}`;
    const prev = latest.get(k);
    if (!prev || prev.block < r.block_number) latest.set(k, { ...r.positionKey, block: r.block_number });
  }
  for (const p of latest.values()) {
    await touchPosition(
      db,
      { chain_id: chainId, contract_address: contractAddress, wallet_address: p.wallet, collateral_asset: p.asset },
      p.block,
    );
  }
  return rows.length;
}

async function loadTimestamps(client: PublicClient, blockNumbers: Iterable<bigint>): Promise<Map<bigint, string>> {
  const out = new Map<bigint, string>();
  const unique = [...new Set(blockNumbers)].slice(0, 200); // cap RPC calls per chunk
  for (const bn of unique) {
    try {
      const block = await client.getBlock({ blockNumber: bn });
      out.set(bn, new Date(Number(block.timestamp) * 1000).toISOString());
    } catch {
      /* best effort */
    }
  }
  return out;
}

/* ---- snapshots ---- */

const TEN = BigInt(10);
const WAD = BigInt(10) ** BigInt(18);

export function toUsd(amount: bigint, tokenDecimals: number, price: bigint, priceDecimals: number): bigint {
  return (amount * WAD * price) / TEN ** BigInt(tokenDecimals + priceDecimals);
}

export async function takeSnapshots(
  db: SupabaseClient,
  client: PublicClient,
  chainId: number,
): Promise<number> {
  const a = getContractAddresses();
  if (!a.registry) return 0;
  const assets = (await client.readContract({
    address: a.registry,
    abi: collateralRegistryAbi,
    functionName: "listAssets",
  })) as readonly Address[];
  const rows: RiskSnapshotInsert[] = [];
  for (const asset of assets) {
    try {
      const cfg = await client.readContract({
        address: a.registry,
        abi: collateralRegistryAbi,
        functionName: "getCollateralConfig",
        args: [asset],
      });
      const price = await client.readContract({
        address: cfg.oracle,
        abi: oracleAdapterAbi,
        functionName: "getPriceData",
        args: [asset],
      });
      const totalCollateral = a.vault
        ? await client.readContract({ address: a.vault, abi: collateralVaultAbi, functionName: "getTotalCollateral", args: [asset] })
        : BigInt(0);
      const debt = a.pool
        ? await client.readContract({ address: a.pool, abi: mosaicLendingPoolAbi, functionName: "getOutstandingDebt", args: [asset] })
        : BigInt(0);
      const valid = Boolean(price.valid) && price.price > BigInt(0);
      const collateralUsd = valid ? toUsd(totalCollateral, Number(cfg.decimals), price.price, Number(price.decimals)) : null;
      const utilization = cfg.borrowCap > BigInt(0) ? Number((debt * BigInt(1000000)) / cfg.borrowCap) / 1_000_000 : null;
      rows.push({
        chain_id: chainId,
        asset_address: asset.toLowerCase(),
        price: valid ? price.price.toString() : null,
        price_decimals: Number(price.decimals),
        price_updated_at: price.updatedAt > BigInt(0) ? new Date(Number(price.updatedAt) * 1000).toISOString() : null,
        total_collateral: totalCollateral.toString(),
        collateral_value_usd: collateralUsd === null ? null : collateralUsd.toString(),
        outstanding_debt: debt.toString(),
        borrow_cap: cfg.borrowCap.toString(),
        utilization: utilization === null ? null : utilization.toFixed(6),
        health_metrics: {
          maxLtvBps: Number(cfg.maxLtvBps),
          liquidationThresholdBps: Number(cfg.liquidationThresholdBps),
          liquidationPenaltyBps: Number(cfg.liquidationPenaltyBps),
          maxExposure: cfg.maxExposure.toString(),
          minDeposit: cfg.minDeposit.toString(),
          status: Number(cfg.status),
          kind: Number(cfg.kind),
          oracle: cfg.oracle.toLowerCase(),
          decimals: Number(cfg.decimals),
          priceValid: valid,
        },
      });
    } catch (err) {
      console.warn(`[indexer] snapshot failed for ${asset}:`, err instanceof Error ? err.message : err);
    }
  }
  await insertSnapshots(db, rows);
  return rows.length;
}

/* ---- main entry ---- */

export async function runIndexer(opts: IndexerRunOptions): Promise<IndexerRunResult> {
  const chainId = opts.chainId ?? getChainId();
  const client = opts.client ?? makeViemClient();
  const contracts = opts.contracts ?? contractsFromEnv();
  const deployBlock = opts.deployBlock ?? getDeployBlock();
  const maxChunks = opts.maxChunksPerRun ?? DEFAULT_MAX_CHUNKS_PER_RUN;
  const fetchTimestamps = opts.fetchTimestamps ?? true;

  const latest = await client.getBlockNumber();
  let processed = 0;
  let runFrom: bigint | null = null;
  let runTo: bigint = latest;

  for (const contract of contracts) {
    const key = cursorKey(chainId, contract.address);
    const cursor = await getCursor(opts.db, key);
    let from = cursor === null ? deployBlock : cursor + BigInt(1);
    if (from > latest) continue;
    if (runFrom === null || from < runFrom) runFrom = from;

    let chunks = 0;
    let reached = from - BigInt(1);
    while (from <= latest && chunks < maxChunks) {
      const to = from + MAX_CHUNK_BLOCKS - BigInt(1) < latest ? from + MAX_CHUNK_BLOCKS - BigInt(1) : latest;
      const logs = await client.getLogs({ address: contract.address, fromBlock: from, toBlock: to });
      if (logs.length > 0) {
        const ts = fetchTimestamps ? await loadTimestamps(client, logs.map((l) => l.blockNumber!)) : new Map<bigint, string>();
        const rows = decodeLogs(chainId, contract, logs, ts);
        processed += await persistDecodedEvents(opts.db, chainId, contract.address, rows);
      }
      reached = to;
      await setCursor(opts.db, { key, chain_id: chainId, contract_address: contract.address, last_block: to });
      from = to + BigInt(1);
      chunks += 1;
    }
    if (reached < runTo) runTo = reached;
  }

  let snapshots = 0;
  if (!opts.skipSnapshots) {
    try {
      snapshots = await takeSnapshots(opts.db, client, chainId);
    } catch (err) {
      console.warn("[indexer] snapshot phase failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    processed,
    fromBlock: Number(runFrom ?? latest),
    toBlock: Number(runTo),
    snapshots,
  };
}
