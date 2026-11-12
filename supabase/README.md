# Supabase (optional)

Mosaic Vault runs **without** Supabase. When `NEXT_PUBLIC_SUPABASE_URL` is empty every read route
returns `{ ok: true, data: [], source: "unconfigured" }`, sign-in nonces live in process memory
(dev only) and the frontend reads history straight from the RPC.

Supabase only stores an **index** (events, positions, risk snapshots) and metadata (collateral
asset labels, audit notes). The contracts are the source of truth.

## Files

| File | Purpose |
|---|---|
| `migrations/0001_init.sql` | Tables, indexes, lowercase-address check constraints |
| `policies/0001_rls.sql` | RLS: anon/authenticated may only SELECT public chain data |
| `seed/collateral_assets.sql` | Collateral asset metadata for Mezo Testnet (chain 31611) |

## Apply — option A: SQL editor

1. Open the project in the Supabase dashboard → **SQL Editor**.
2. Paste and run, in order: `migrations/0001_init.sql`, `policies/0001_rls.sql`, then
   `seed/collateral_assets.sql` (after replacing the placeholder tWBTC / tUSD addresses with the
   values from `contracts/deployments/mezo-testnet.json`).

## Apply — option B: Supabase CLI

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push                                # applies supabase/migrations/*
psql "$SUPABASE_DB_URL" -f supabase/policies/0001_rls.sql
psql "$SUPABASE_DB_URL" -f supabase/seed/collateral_assets.sql
```

(`supabase db push` only picks up `migrations/`; policies and seed are applied with `psql`, or
paste them in the SQL editor.)

## Environment

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>        # read-only for public index data (RLS)
SUPABASE_SERVICE_ROLE_KEY=<service role key>    # server routes only; never shipped to the browser
INDEXER_SECRET=<random>                         # x-indexer-secret header for POST /api/indexer/run
CRON_SECRET=<random>                            # Vercel cron Authorization: Bearer <CRON_SECRET>
SESSION_SECRET=<>= 32 chars>                    # HS256 session cookie
```

## Indexer

`vercel.json` schedules `GET /api/indexer/run` every 5 minutes. Vercel sends
`Authorization: Bearer $CRON_SECRET`; manual runs use `POST` with `x-indexer-secret: $INDEXER_SECRET`:

```bash
curl -X POST -H "x-indexer-secret: $INDEXER_SECRET" https://<app>/api/indexer/run
```

The indexer starts at `NEXT_PUBLIC_DEPLOY_BLOCK`, reads logs in chunks of 9,000 blocks
(the RPC caps `eth_getLogs` at 9,999), upserts with `ignoreDuplicates` on
`(chain_id, transaction_hash, log_index)` and then writes one `asset_risk_snapshots` row per
registered asset. It is safe to run repeatedly.
