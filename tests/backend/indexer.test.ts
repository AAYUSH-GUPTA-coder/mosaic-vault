import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeEventTopics, type Abi, type Log } from "viem";
import { mosaicLendingEngineAbi } from "@/lib/blockchain/abis";
import { decodeLogs, persistDecodedEvents, runIndexer, serializeArgs, type IndexedContract } from "@/lib/database/indexer";

const ENGINE = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const USER = "0x1111111111111111111111111111111111111111";
const ASSET = "0x7b7c000000000000000000000000000000000000";
const TX = "0x" + "ab".repeat(32);

/** Minimal fake of the Supabase query builder that enforces the unique keys the indexer relies on. */
function fakeSupabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    indexed_events: [],
    positions: [],
    indexer_cursors: [],
    asset_risk_snapshots: [],
  };
  const conflictKey = (row: Record<string, unknown>, cols: string) => cols.split(",").map((c) => String(row[c.trim()])).join("|");

  function from(table: string) {
    const rows = tables[table];
    const filters: Array<(r: Record<string, unknown>) => boolean> = [];
    let pendingUpdate: Record<string, unknown> | null = null;
    const builder: Record<string, unknown> = {
      upsert(data: Record<string, unknown> | Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates?: boolean }) {
        for (const row of Array.isArray(data) ? data : [data]) {
          const key = conflictKey(row, opts.onConflict);
          const idx = rows.findIndex((r) => conflictKey(r, opts.onConflict) === key);
          if (idx === -1) rows.push({ id: rows.length + 1, ...row });
          else if (!opts.ignoreDuplicates) rows[idx] = { ...rows[idx], ...row };
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert(data: Record<string, unknown> | Record<string, unknown>[]) {
        for (const row of Array.isArray(data) ? data : [data]) rows.push({ id: rows.length + 1, ...row });
        return Promise.resolve({ data: null, error: null });
      },
      update(data: Record<string, unknown>) {
        pendingUpdate = data;
        return builder;
      },
      select() {
        return builder;
      },
      eq(col: string, v: unknown) {
        filters.push((r) => r[col] === v);
        return builder;
      },
      lt(col: string, v: number) {
        filters.push((r) => Number(r[col]) < v);
        return builder;
      },
      maybeSingle() {
        const hit = rows.find((r) => filters.every((f) => f(r))) ?? null;
        return Promise.resolve({ data: hit, error: null });
      },
      then(resolve: (v: { data: unknown; error: null }) => void) {
        if (pendingUpdate) {
          for (const r of rows) if (filters.every((f) => f(r))) Object.assign(r, pendingUpdate);
          pendingUpdate = null;
        }
        resolve({ data: rows.filter((r) => filters.every((f) => f(r))), error: null });
      },
    };
    return builder;
  }
  return { client: { from } as unknown as SupabaseClient, tables };
}

function positionOpenedLog(blockNumber: bigint, logIndex: number): Log {
  const topics = encodeEventTopics({ abi: mosaicLendingEngineAbi, eventName: "PositionOpened", args: { user: USER, asset: ASSET } });
  return {
    address: ENGINE,
    topics,
    data: "0x",
    blockNumber,
    blockHash: "0x" + "cd".repeat(32),
    transactionHash: TX,
    transactionIndex: 0,
    logIndex,
    removed: false,
  } as Log;
}

const contract: IndexedContract = { key: "engine", address: ENGINE, abi: mosaicLendingEngineAbi as Abi };

describe("indexer", () => {
  it("serialises bigint args as strings", () => {
    expect(serializeArgs({ amount: BigInt(5), user: USER })).toEqual({ amount: "5", user: USER });
  });

  it("decodes PositionOpened into a row with wallet + asset and a position key", () => {
    const rows = decodeLogs(31611, contract, [positionOpenedLog(BigInt(100), 3)], new Map([[BigInt(100), "2026-11-07T00:00:00.000Z"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      chain_id: 31611,
      contract_address: ENGINE,
      transaction_hash: TX,
      block_number: 100,
      log_index: 3,
      event_name: "PositionOpened",
      wallet_address: USER,
      asset_address: ASSET,
      block_timestamp: "2026-11-07T00:00:00.000Z",
      isPositionOpened: true,
    });
  });

  it("is idempotent: the same log twice produces one indexed_events row and one position", async () => {
    const { client, tables } = fakeSupabase();
    const rows = decodeLogs(31611, contract, [positionOpenedLog(BigInt(100), 3)]);
    await persistDecodedEvents(client, 31611, ENGINE, rows);
    await persistDecodedEvents(client, 31611, ENGINE, rows);
    expect(tables.indexed_events).toHaveLength(1);
    expect(tables.positions).toHaveLength(1);
    expect(tables.positions[0]).toMatchObject({
      wallet_address: USER,
      collateral_asset: ASSET,
      contract_position_id: `${ENGINE}:${USER}:${ASSET}`,
      first_seen_block: 100,
      last_event_block: 100,
    });
  });

  it("runIndexer chunks by <= 9,000 blocks, dedupes across runs and advances the cursor", async () => {
    const { client, tables } = fakeSupabase();
    const ranges: Array<[bigint, bigint]> = [];
    const log = positionOpenedLog(BigInt(1500), 0);
    const publicClient = {
      getBlockNumber: async () => BigInt(20000),
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        ranges.push([fromBlock, toBlock]);
        return fromBlock <= BigInt(1500) && BigInt(1500) <= toBlock ? [log] : [];
      },
    };
    const opts = {
      db: client,
      client: publicClient as never,
      chainId: 31611,
      deployBlock: BigInt(1000),
      contracts: [contract],
      skipSnapshots: true,
      fetchTimestamps: false,
    };
    const first = await runIndexer(opts);
    expect(first).toMatchObject({ processed: 1, fromBlock: 1_000, toBlock: 20_000 });
    expect(ranges).toEqual([[BigInt(1000), BigInt(9999)], [BigInt(10000), BigInt(18999)], [BigInt(19000), BigInt(20000)]]);
    for (const [from, to] of ranges) expect(to - from + BigInt(1) <= BigInt(9000)).toBe(true);
    expect(tables.indexer_cursors[0]).toMatchObject({ key: `events:31611:${ENGINE}`, last_block: 20_000 });

    // Second run: cursor is at latest, nothing re-read; re-feeding the same log would still not duplicate.
    const second = await runIndexer(opts);
    expect(second.processed).toBe(0);
    expect(tables.indexed_events).toHaveLength(1);
  });
});
