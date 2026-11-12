-- Mosaic Vault — initial schema (docs/API.md, frozen 2026-11-06)
-- Supabase stores an INDEX and metadata only. Contracts are the financial source of truth.
-- All EVM addresses are stored lowercase (enforced by check constraints below).

create extension if not exists pgcrypto;

-- Mosaic Vault lives in its own schema so it can share a Supabase project with other apps.
-- Expose it to the API with:  alter role authenticator set pgrst.db_schemas = '<existing list>, mosaic';
create schema if not exists mosaic;
grant usage on schema mosaic to anon, authenticated, service_role;
alter default privileges in schema mosaic grant all on tables to service_role;
alter default privileges in schema mosaic grant all on sequences to service_role;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table if not exists mosaic.users (
  id             uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  email          text null,
  created_at     timestamptz not null default now(),
  constraint users_wallet_lowercase check (wallet_address ~ '^0x[0-9a-f]{40}$')
);

-- ---------------------------------------------------------------------------
-- auth_nonces (SIWE-style sign-in nonces; TTL 5 min; used_at = replay guard)
-- ---------------------------------------------------------------------------
create table if not exists mosaic.auth_nonces (
  nonce          text primary key,
  wallet_address text not null,
  expires_at     timestamptz not null,
  used_at        timestamptz null,
  created_at     timestamptz not null default now(),
  constraint auth_nonces_wallet_lowercase check (wallet_address ~ '^0x[0-9a-f]{40}$')
);
create index if not exists auth_nonces_wallet_address_idx on mosaic.auth_nonces (wallet_address);
create index if not exists auth_nonces_expires_at_idx on mosaic.auth_nonces (expires_at);

-- ---------------------------------------------------------------------------
-- collateral_assets (metadata for the UI; the registry contract is authoritative)
-- ---------------------------------------------------------------------------
create table if not exists mosaic.collateral_assets (
  id                  uuid primary key default gen_random_uuid(),
  chain_id            int  not null,
  token_address       text not null,
  symbol              text null,
  name                text null,
  decimals            int  null,
  asset_type          text null check (asset_type in ('verified_external', 'test_only', 'unsupported')),
  oracle_address      text null,
  verification_status text null check (verification_status in ('verified', 'test_only', 'unverified')),
  notes               text null,
  created_at          timestamptz not null default now(),
  constraint collateral_assets_token_lowercase  check (token_address  ~ '^0x[0-9a-f]{40}$'),
  constraint collateral_assets_oracle_lowercase check (oracle_address is null or oracle_address ~ '^0x[0-9a-f]{40}$'),
  constraint collateral_assets_chain_token_unique unique (chain_id, token_address)
);
create index if not exists collateral_assets_chain_id_idx on mosaic.collateral_assets (chain_id);

-- ---------------------------------------------------------------------------
-- positions (index of isolated per-(user, asset) positions)
-- contract_position_id = `${engine}:${wallet}:${asset}`
-- ---------------------------------------------------------------------------
create table if not exists mosaic.positions (
  id                   uuid primary key default gen_random_uuid(),
  wallet_address       text   not null,
  collateral_asset     text   not null,
  contract_position_id text   not null,
  chain_id             int    not null,
  contract_address     text   not null,
  first_seen_block     bigint null,
  last_event_block     bigint null,
  created_at           timestamptz not null default now(),
  constraint positions_wallet_lowercase   check (wallet_address   ~ '^0x[0-9a-f]{40}$'),
  constraint positions_asset_lowercase    check (collateral_asset ~ '^0x[0-9a-f]{40}$'),
  constraint positions_contract_lowercase check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint positions_unique unique (chain_id, contract_address, wallet_address, collateral_asset)
);
create index if not exists positions_wallet_address_idx on mosaic.positions (wallet_address);
create index if not exists positions_collateral_asset_idx on mosaic.positions (collateral_asset);
create index if not exists positions_last_event_block_idx on mosaic.positions (last_event_block);

-- ---------------------------------------------------------------------------
-- indexed_events (decoded contract logs; idempotent on (chain_id, tx, log_index))
-- ---------------------------------------------------------------------------
create table if not exists mosaic.indexed_events (
  id               bigserial primary key,
  chain_id         int    not null,
  contract_address text   not null,
  transaction_hash text   not null,
  block_number     bigint not null,
  log_index        int    not null,
  event_name       text   not null,
  event_payload    jsonb  not null default '{}'::jsonb,
  wallet_address   text   null,
  asset_address    text   null,
  block_timestamp  timestamptz null,
  processed_at     timestamptz not null default now(),
  constraint indexed_events_contract_lowercase check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint indexed_events_tx_lowercase       check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  constraint indexed_events_wallet_lowercase   check (wallet_address is null or wallet_address ~ '^0x[0-9a-f]{40}$'),
  constraint indexed_events_asset_lowercase    check (asset_address  is null or asset_address  ~ '^0x[0-9a-f]{40}$'),
  constraint indexed_events_unique unique (chain_id, transaction_hash, log_index)
);
create index if not exists indexed_events_wallet_address_idx on mosaic.indexed_events (wallet_address);
create index if not exists indexed_events_asset_address_idx  on mosaic.indexed_events (asset_address);
create index if not exists indexed_events_block_number_idx   on mosaic.indexed_events (block_number desc);
create index if not exists indexed_events_chain_block_idx    on mosaic.indexed_events (chain_id, block_number desc, log_index desc);

-- ---------------------------------------------------------------------------
-- indexer_cursors (one row per indexed contract)
-- ---------------------------------------------------------------------------
create table if not exists mosaic.indexer_cursors (
  key              text primary key,
  chain_id         int    not null,
  contract_address text   null,
  last_block       bigint not null default 0,
  updated_at       timestamptz not null default now(),
  constraint indexer_cursors_contract_lowercase check (contract_address is null or contract_address ~ '^0x[0-9a-f]{40}$')
);

-- ---------------------------------------------------------------------------
-- asset_risk_snapshots (periodic contract reads per registered asset)
-- Raw on-chain integers are stored as numeric strings; utilization is a 0..1 fraction.
-- ---------------------------------------------------------------------------
create table if not exists mosaic.asset_risk_snapshots (
  id                   bigserial primary key,
  chain_id             int  not null,
  asset_address        text not null,
  price                numeric null,
  price_decimals       int     null,
  price_updated_at     timestamptz null,
  total_collateral     numeric null,
  collateral_value_usd numeric null,
  outstanding_debt     numeric null,
  borrow_cap           numeric null,
  utilization          numeric null,
  health_metrics       jsonb   not null default '{}'::jsonb,
  taken_at             timestamptz not null default now(),
  constraint asset_risk_snapshots_asset_lowercase check (asset_address ~ '^0x[0-9a-f]{40}$')
);
create index if not exists asset_risk_snapshots_asset_address_idx on mosaic.asset_risk_snapshots (asset_address);
create index if not exists asset_risk_snapshots_asset_taken_idx   on mosaic.asset_risk_snapshots (chain_id, asset_address, taken_at);

-- ---------------------------------------------------------------------------
-- audit_logs (off-chain notes about on-chain admin actions; never moves funds)
-- ---------------------------------------------------------------------------
create table if not exists mosaic.audit_logs (
  id         bigserial primary key,
  actor      text  not null,
  action     text  not null,
  target     text  null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint audit_logs_actor_lowercase check (actor ~ '^0x[0-9a-f]{40}$')
);
create index if not exists audit_logs_actor_idx      on mosaic.audit_logs (actor);
create index if not exists audit_logs_created_at_idx on mosaic.audit_logs (created_at desc);
