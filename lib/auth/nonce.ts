import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getNonceRow, insertNonce, markNonceUsed } from "@/lib/database/queries";

/**
 * Sign-in nonces: 32 random bytes (hex), TTL 5 minutes, single use.
 * Backed by `auth_nonces` when a Supabase service client is supplied; otherwise an in-memory
 * Map (DEV ONLY — nonces do not survive a restart and are not shared across instances).
 */

export const NONCE_TTL_MS = 5 * 60 * 1000;

export type NonceCheck = "ok" | "not_found" | "used" | "expired" | "address_mismatch";

interface MemNonce {
  wallet: string;
  expiresAt: number;
  usedAt: number | null;
}

const memory = new Map<string, MemNonce>();

function sweepMemory(now: number): void {
  if (memory.size < 500) return;
  for (const [k, v] of memory) if (v.expiresAt + NONCE_TTL_MS < now) memory.delete(k);
}

/** Test helper: clears the in-memory store. */
export function _resetNonceStore(): void {
  memory.clear();
}

export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

export async function issueNonce(
  db: SupabaseClient | null,
  address: string,
  now: number = Date.now(),
): Promise<{ nonce: string; issuedAt: string; expiresAt: string }> {
  const wallet = address.toLowerCase();
  const nonce = generateNonce();
  const expiresAtMs = now + NONCE_TTL_MS;
  const issuedAt = new Date(now).toISOString();
  const expiresAt = new Date(expiresAtMs).toISOString();
  if (db) {
    await insertNonce(db, { nonce, wallet_address: wallet, expires_at: expiresAt });
  } else {
    sweepMemory(now);
    memory.set(nonce, { wallet, expiresAt: expiresAtMs, usedAt: null });
  }
  return { nonce, issuedAt, expiresAt };
}

/** Validates and atomically consumes a nonce (replay protection). */
export async function consumeNonce(
  db: SupabaseClient | null,
  nonce: string,
  address: string,
  now: number = Date.now(),
): Promise<NonceCheck> {
  const wallet = address.toLowerCase();
  if (db) {
    const row = await getNonceRow(db, nonce);
    if (!row) return "not_found";
    if (row.wallet_address !== wallet) return "address_mismatch";
    if (row.used_at) return "used";
    if (Date.parse(row.expires_at) <= now) return "expired";
    const marked = await markNonceUsed(db, nonce, new Date(now).toISOString());
    return marked ? "ok" : "used";
  }
  const row = memory.get(nonce);
  if (!row) return "not_found";
  if (row.wallet !== wallet) return "address_mismatch";
  if (row.usedAt !== null) return "used";
  if (row.expiresAt <= now) return "expired";
  row.usedAt = now;
  return "ok";
}
