# Mosaic Vault — Architecture & Discovery (frozen 2026-11-06)

Modular multi-collateral lending layer on **Mezo Testnet**. Users deposit collateral into isolated per-asset positions and borrow MUSD from a funded lending pool. Mosaic Vault does **not** modify Mezo's native MUSD CDP system and does not mint MUSD; it lends MUSD that liquidity providers deposited into `MosaicLendingPool`.

## Phase 1 discovery — verified on-chain 2026-11-06

| Item | Value | How verified |
|---|---|---|
| Chain ID | 31611 | `eth_chainId` on rpc.test.mezo.org → 0x7b7b |
| RPC | https://rpc.test.mezo.org (wss://rpc-ws.test.mezo.org) | live, block 0xfd7878 |
| Explorer | https://explorer.test.mezo.org (Blockscout) | HTTP 200 |
| Explorer API | https://api.explorer.test.mezo.org/api/v2 | `/tokens/<MUSD>` returns JSON |
| MUSD | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` — "Mezo USD", MUSD, **18 decimals**, ERC-20 | symbol/decimals/totalSupply calls + official contracts reference |
| BTC ERC-20 precompile | `0x7b7C000000000000000000000000000000000000` — name "BTC", symbol BTC, **18 decimals**; `balanceOf` mirrors native BTC balance | on-chain calls (has code; balanceOf(deployer) == native balance) |
| BTC/USD oracle precompile | `0x7b7c000000000000000000000000000000000015` — Chainlink `AggregatorV3`-style `latestRoundData()`, **18 decimals**, `answeredInRound` = 0 (do not check it), updates every few seconds | on-chain call; price 75,591.62 USD at 1793975135 |
| Mezo PriceFeed | `0x86bCF0841622a5dAC14A313a15f96A95421b9366` — `fetchPrice()` returns 18-dec BTC/USD, reverts "Oracle is stale" after 60s; `oracle()` = precompile above | on-chain call |
| Bridged tokens (mUSDC, mUSDT, mcbBTC…) | **No code on testnet** at the documented (mainnet) addresses | `eth_getCode` = 0x |
| Faucet | https://faucet.test.mezo.org (Cloudflare Turnstile; manual only) | HTTP 200 |
| Testnet MUSD | obtained by opening a trove (≥1,800 MUSD) at testnet.mezo.org, or transferred from a funded wallet | docs + prior projects |
| Gas | native BTC, 18 dec; evm `london`; solc 0.8.28 per Mezo docs | docs |

## Collateral assets for the MVP

| Asset | Kind | Token | Oracle | Notes |
|---|---|---|---|---|
| BTC | **Verified external** | BTC ERC-20 precompile `0x7b7C…0000` (18 dec) | `ChainlinkFeedOracleAdapter` over precompile `0x7b7c…0015` (18 dec, max staleness 900s) | Real Mezo testnet BTC. ERC-20 `approve/transferFrom` on the precompile is verified at deployment (a real tx), not assumed. Precompiles cannot be simulated in Hardhat/anvil → local tests use `MockERC20` + `MockAggregatorV3`. |
| tWBTC | **Test-only** | `TestCollateralToken` "Mosaic Test Wrapped BTC (test-only)", symbol `tWBTC`, **8 decimals**, minted only by MINTER_ROLE (the deployer) | `TestPriceOracle` (admin-set, 8 dec) seeded from live BTC price | Exercises decimal normalization and the liquidation demo (controlled price drop). Never labelled as real WBTC. |
| tUSD | **Test-only** | `TestCollateralToken` "Mosaic Test Stablecoin (test-only)", symbol `tUSD`, **6 decimals**, minted only by MINTER_ROLE (the deployer) | `TestPriceOracle` (admin-set, 8 dec) at 1.00 | Second collateral type with its own, lower-risk parameters. |
| Tokenized RWA | Not enabled | — | — | Listed in the UI as unsupported; requires oracle, custody and legal review. |

Initial **testnet-only** risk parameters (illustrative, not production advice):

| Asset | Max LTV | Liq. threshold | Liq. penalty | Borrow cap (MUSD) | Max exposure | Min deposit |
|---|---:|---:|---:|---:|---:|---:|
| BTC | 60% | 70% | 8% | 500 | 0.5 BTC | 0.0001 BTC |
| tWBTC | 60% | 70% | 8% | 500 | 10 tWBTC | 0.0001 tWBTC |
| tUSD | 70% | 80% | 5% | 300 | 100,000 tUSD | 1 tUSD |

Borrow caps are small because the pool is funded from one testnet wallet (~1,000 MUSD).

## Components (see docs/CONTRACTS.md for exact interfaces)

- `CollateralRegistry` — per-asset config + oracle binding + status; `RISK_MANAGER_ROLE`.
- `IPriceOracleAdapter` + `ChainlinkFeedOracleAdapter` (verified feeds) + `TestPriceOracle` (test-only, admin-set).
- `CollateralVault` — holds collateral, per-user/per-asset accounting; only the engine moves balances.
- `MosaicLendingPool` — holds MUSD; LP deposits/withdrawals; only the engine lends/receives repayment.
- `MosaicLendingEngine` — the single user entry point (deposit, borrow, repay, withdraw, views). **Isolated positions per (user, asset).** The engine is the only spender users approve (for collateral and for MUSD).
- `MosaicLiquidationEngine` — permissionless liquidation of positions with health factor < 1.

No interest accrues in the MVP (0% fixed; stated in the UI and README). No fictional APY anywhere.

## Off-chain

- Next.js 16 App Router (TypeScript strict, Tailwind v4, shadcn/ui radix, wagmi v3 + viem + RainbowKit, TanStack Query, RHF + Zod, Recharts).
- Supabase Postgres for index/metadata only (users, collateral_assets, positions index, indexed_events, asset_risk_snapshots, audit_logs) with RLS. Contracts are the source of truth. The app must run **without** Supabase configured (history falls back to RPC `getLogs`, ≤9,999 blocks per request).
- Wallet-signature auth (SIWE-style message, nonce with expiry, replay protection, httpOnly session cookie).
- Hosting: Vercel (frontend + API routes). Indexer runs via `POST /api/indexer/run` guarded by a secret (Vercel cron or manual).

## Repository layout

```
app/(marketing)  landing          app/(app)/{dashboard,collateral,deposit,borrow,portfolio,positions/[asset],protocol,risk}
app/api/...      backend routes   components/{ui,layout,dashboard,collateral,positions,transactions,risk,landing}
contracts/       Hardhat 3        lib/{blockchain,auth,database,oracle,validation,formatting}
supabase/{migrations,policies}    hooks/  types/  docs/  tests/  public/
```

## Ownership (parallel agents)

| Agent | Owns (only edits these) |
|---|---|
| contracts | `contracts/**`, `lib/blockchain/abis/**` (generated), `docs/SECURITY.md`, `docs/TEST_REPORT.md` |
| backend | `supabase/**`, `lib/auth/**`, `lib/database/**`, `app/api/**`, `tests/backend/**`, `types/api.ts` |
| web-app | `app/(app)/**`, `lib/blockchain/**` (except abis), `lib/oracle`, `lib/validation`, `lib/formatting`, `hooks/**`, `components/{dashboard,collateral,positions,transactions,risk,wallet}/**`, `types/*.ts` (except api.ts), `app/providers.tsx` |
| web-landing | `app/(marketing)/**`, `app/layout.tsx`, `app/globals.css`, `app/not-found.tsx`, `app/{robots,sitemap,manifest}.ts`, `app/icon.*`, `app/opengraph-image.*`, `components/{layout,landing}/**`, `public/**` |

Shared docs (`docs/CONTRACTS.md`, `docs/API.md`, `docs/DESIGN.md`) are frozen; propose changes to the lead instead of editing.
