# Mosaic Vault — Backend, Data Model & API (FROZEN 2026-11-06)

Contracts are the financial source of truth. Supabase stores an **index** and metadata only. The app must work with Supabase unset (`NEXT_PUBLIC_SUPABASE_URL` empty): every read route returns `{ ok: true, data: [], source: "unconfigured" }` and the frontend falls back to RPC.

## Environment (.env.example is canonical)
Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` (≥32 chars, HS256), `INDEXER_SECRET`, `DEPLOYER_PRIVATE_KEY` (contracts only). Public: `NEXT_PUBLIC_*` per .env.example. Never read `SUPABASE_SERVICE_ROLE_KEY` in client code; `lib/database/server.ts` must be `import "server-only"`.

## Supabase schema — `supabase/migrations/0001_init.sql`
```sql
users(id uuid pk default gen_random_uuid(), wallet_address text unique not null (lowercase), email text null, created_at timestamptz default now())
auth_nonces(nonce text pk, wallet_address text not null, expires_at timestamptz not null, used_at timestamptz null, created_at timestamptz default now())
collateral_assets(id uuid pk, chain_id int not null, token_address text not null, symbol text, name text, decimals int, asset_type text check in ('verified_external','test_only','unsupported'), oracle_address text, verification_status text check in ('verified','test_only','unverified'), notes text, created_at; unique(chain_id, token_address))
positions(id uuid pk, wallet_address text not null, collateral_asset text not null, contract_position_id text not null, chain_id int not null, contract_address text not null, first_seen_block bigint, last_event_block bigint, created_at; unique(chain_id, contract_address, wallet_address, collateral_asset))
indexed_events(id bigserial pk, chain_id int, contract_address text, transaction_hash text, block_number bigint, log_index int, event_name text, event_payload jsonb, wallet_address text null, asset_address text null, block_timestamp timestamptz null, processed_at timestamptz default now(); unique(chain_id, transaction_hash, log_index))
indexer_cursors(key text pk, chain_id int, contract_address text, last_block bigint, updated_at)
asset_risk_snapshots(id bigserial pk, chain_id int, asset_address text, price numeric, price_decimals int, price_updated_at timestamptz, total_collateral numeric, collateral_value_usd numeric, outstanding_debt numeric, borrow_cap numeric, utilization numeric, health_metrics jsonb, taken_at timestamptz default now())
audit_logs(id bigserial pk, actor text, action text, target text, metadata jsonb, created_at timestamptz default now())
```
`contract_position_id` = `${engine}:${wallet}:${asset}` (positions are isolated per (user, asset)).

## RLS — `supabase/policies/0001_rls.sql`
RLS enabled on every table. `anon`/`authenticated` roles: SELECT on `collateral_assets`, `indexed_events`, `asset_risk_snapshots`, `positions` (public chain data); **no** access to `users`, `auth_nonces`, `audit_logs`, `indexer_cursors`. All writes go through the service role in server routes only. The anon key is therefore read-only for public index data.

## Auth (wallet signature, SIWE-style) — `lib/auth/`
- `POST /api/auth/nonce` `{ address }` → `{ nonce, message, expiresAt }`. Nonce: 32 random bytes hex, TTL 5 min, stored in `auth_nonces`. Message format (EIP-4361 text):
  `Mosaic Vault wants you to sign in with your Mezo account:\n{address}\n\nSign in to Mosaic Vault. No transaction, no gas.\n\nURI: {origin}\nVersion: 1\nChain ID: 31611\nNonce: {nonce}\nIssued At: {iso}\nExpiration Time: {iso}`
- `POST /api/auth/verify` `{ address, message, signature }` → verifies with viem `verifyMessage`, checks nonce exists, unused, unexpired, address matches, chain id 31611; marks `used_at` (replay protection); upserts `users`; sets cookie `mv_session` (httpOnly, secure in prod, sameSite=lax, 7d) = HS256 JWT `{ sub: address(lowercase), iat, exp }` signed with `SESSION_SECRET` (use `jose`).
- `POST /api/auth/logout` clears cookie. `GET /api/auth/me` → `{ address } | 401`.
- `lib/auth/session.ts`: `getSession(req)`, `requireSession(req)`. `lib/auth/manager.ts`: `isManager(address)` = on-chain `hasRole(RISK_MANAGER_ROLE)` on the registry via viem public client (cached 60s).
- Without Supabase: nonces are kept in an in-memory Map (dev only; documented).

## Routes (all JSON, Zod-validated; errors `{ ok:false, error:{ code, message } }` with 400/401/403/404/500)
- `GET  /api/assets` → collateral_assets rows for chain 31611 (+ static fallback from `lib/blockchain/config.ts` when unconfigured).
- `GET  /api/positions?wallet=0x..` → positions index rows.
- `GET  /api/events?wallet=0x..&asset=0x..&limit=50&cursor=` → indexed_events newest-first.
- `GET  /api/snapshots?asset=0x..&limit=100` → asset_risk_snapshots oldest-first.
- `POST /api/indexer/run` header `x-indexer-secret` → runs the indexer once (see below); returns `{ ok, processed, fromBlock, toBlock }`. Also callable by Vercel cron (`vercel.json` schedule every 5 min with the same header via CRON_SECRET check).
- `POST /api/admin/audit` (session + isManager) `{ action, target, metadata }` → inserts audit_logs row (off-chain note of an on-chain admin action; never changes balances).
- `GET  /api/admin/audit?limit=` (session + isManager).
- `GET  /api/health` → `{ ok, chainId, rpc: "ok"|"error", supabase: "configured"|"unconfigured" }`.

## Indexer — `lib/database/indexer.ts`
Reads engine + pool + registry + liquidation engine logs from `last_block+1` to `latest` in chunks of ≤ 9,000 blocks (RPC caps `getLogs` at 9,999). Decodes with the ABIs in `lib/blockchain/abis`. Upserts `indexed_events` on `(chain_id, transaction_hash, log_index)` (idempotent, `ignoreDuplicates`), upserts `positions` for `PositionOpened`, writes `indexer_cursors`. After indexing, takes one `asset_risk_snapshots` row per registered asset from contract reads (`getCollateralConfig`, oracle `getPriceData`, `vault.getTotalCollateral`, `pool.getOutstandingDebt`). Start block = `NEXT_PUBLIC_DEPLOY_BLOCK`.

## Shared TS types — `types/api.ts`
`ApiOk<T> = { ok: true; data: T; source?: "supabase" | "unconfigured" | "static" }`, `ApiErr = { ok: false; error: { code: string; message: string } }`, row types `IndexedEvent`, `PositionIndex`, `CollateralAssetRow`, `RiskSnapshot`, `AuditLog`.

## Tests — `tests/backend/*.test.ts` (node:test or vitest, run with `npm run test:backend`)
Nonce issue/verify happy path, wrong signer, expired nonce, replayed nonce, bad chain id, session cookie decode, manager gate (mocked `hasRole`), indexer dedupe (same log twice → one row), input validation (bad address → 400), service-role key never reachable from client bundle (grep test on `.next` is out of scope; instead assert `lib/database/server.ts` imports `server-only`).
