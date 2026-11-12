# Mosaic Vault

**More collateral. More access to Bitcoin-backed liquidity.**

Mosaic Vault is a modular multi-collateral lending layer on **Mezo Testnet**. Users deposit a supported asset into an isolated collateral vault and borrow **MUSD** from a funded lending pool, with asset-specific loan-to-value limits, liquidation thresholds, penalties, caps, and oracles.

> Testnet MVP. Not audited. Not production lending infrastructure. Mosaic Vault does not modify Mezo's native MUSD collateral system and does not mint MUSD; it lends MUSD that liquidity providers deposited into its pool. 0% interest in this MVP.

## Status

See `docs/HANDOFF.md` for the final report (addresses, transaction hashes, test results, limitations). Until deployment is recorded there, treat every address below as empty.

## Network (verified 2026-11-06)

| | |
|---|---|
| Chain | Mezo Testnet, id 31611 |
| RPC | https://rpc.test.mezo.org |
| Explorer | https://explorer.test.mezo.org |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 decimals) |
| BTC (ERC-20 precompile) | `0x7b7C000000000000000000000000000000000000` (18 decimals) — verified external collateral |
| BTC/USD oracle precompile | `0x7b7c000000000000000000000000000000000015` (18 decimals) |

Test-only assets (project-created, no value): `tWBTC` (8 decimals) and `tUSD` (6 decimals), both with an admin-set `TestPriceOracle`. They are labelled test-only everywhere in the interface and are never presented as real WBTC or a stablecoin.

## Layout

```
app/(marketing)   landing           app/(app)/…     dashboard, collateral, deposit, borrow, portfolio, positions/[asset], protocol, risk
app/api           backend routes    contracts/      Hardhat 3 (Solidity 0.8.28, OpenZeppelin v5)
lib/blockchain    viem/wagmi layer  lib/auth, lib/database   wallet-signature auth, Supabase index
supabase/         migrations, RLS   docs/           ARCHITECTURE, CONTRACTS, API, DESIGN, SECURITY, TEST_REPORT, HANDOFF
```

## Run locally

```bash
npm install
cp .env.example .env.local        # fill addresses from contracts/deployments/mezo-testnet.json
npm run dev                        # http://localhost:3000

cd contracts && npm install
npx hardhat test                   # Solidity + TypeScript tests
```

Supabase is optional. Without it, transaction history is read from the chain directly.

## Deploy contracts (Mezo Testnet only)

```bash
cd contracts
# contracts/.env: DEPLOYER_PRIVATE_KEY=0x… (funded with testnet BTC for gas and MUSD for the pool)
npx hardhat run scripts/deploy.ts --network mezoTestnet
FUND_AMOUNT_MUSD=500 npx hardhat run scripts/fund-pool.ts --network mezoTestnet
npx hardhat run scripts/demo-flow.ts --network mezoTestnet
```

## Docs

- `docs/ARCHITECTURE.md` — discovery, components, asset list, parameters
- `docs/CONTRACTS.md` — contract interfaces and math
- `docs/API.md` — data model, auth, routes, indexer
- `docs/DESIGN.md` — design system
- `docs/SECURITY.md` — threat model and mitigations
- `docs/TEST_REPORT.md` — test results
- `docs/HANDOFF.md` — final report
