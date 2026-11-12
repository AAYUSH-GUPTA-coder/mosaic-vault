-- Mosaic Vault — Row Level Security (docs/API.md, frozen 2026-11-06)
-- The anon key is READ-ONLY for public chain-index data. All writes happen through
-- the service role inside server routes (lib/database/server.ts).

alter table mosaic.users                enable row level security;
alter table mosaic.auth_nonces          enable row level security;
alter table mosaic.collateral_assets    enable row level security;
alter table mosaic.positions            enable row level security;
alter table mosaic.indexed_events       enable row level security;
alter table mosaic.indexer_cursors      enable row level security;
alter table mosaic.asset_risk_snapshots enable row level security;
alter table mosaic.audit_logs           enable row level security;

-- Belt and braces: no grants at all on private tables for the public roles.
revoke all on mosaic.users           from anon, authenticated;
revoke all on mosaic.auth_nonces     from anon, authenticated;
revoke all on mosaic.audit_logs      from anon, authenticated;
revoke all on mosaic.indexer_cursors from anon, authenticated;

-- Public roles may only SELECT on public chain data; no insert/update/delete policies exist,
-- so with RLS enabled every write from anon/authenticated is rejected.
grant select on mosaic.collateral_assets    to anon, authenticated;
grant select on mosaic.positions            to anon, authenticated;
grant select on mosaic.indexed_events       to anon, authenticated;
grant select on mosaic.asset_risk_snapshots to anon, authenticated;

drop policy if exists "public read collateral_assets" on mosaic.collateral_assets;
create policy "public read collateral_assets"
  on mosaic.collateral_assets for select to anon, authenticated using (true);

drop policy if exists "public read positions" on mosaic.positions;
create policy "public read positions"
  on mosaic.positions for select to anon, authenticated using (true);

drop policy if exists "public read indexed_events" on mosaic.indexed_events;
create policy "public read indexed_events"
  on mosaic.indexed_events for select to anon, authenticated using (true);

drop policy if exists "public read asset_risk_snapshots" on mosaic.asset_risk_snapshots;
create policy "public read asset_risk_snapshots"
  on mosaic.asset_risk_snapshots for select to anon, authenticated using (true);

-- users, auth_nonces, audit_logs, indexer_cursors: RLS enabled with NO policies
-- => only the service role (which bypasses RLS) can read or write them.

-- The service role (server routes only) reads and writes every Mosaic table.
grant all on all tables in schema mosaic to service_role;
grant all on all sequences in schema mosaic to service_role;
