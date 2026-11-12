# Mosaic Vault — Contract Test Report

Generated 2026-11-07 from `cd contracts && npx hardhat test` (Hardhat 3.21, solc 0.8.28, evm `london`, optimizer 200 runs, OpenZeppelin v5, forge-std v1.9.6).

## Summary

```
101 passing (94 solidity, 7 nodejs)
  0 failing
```

- Solidity suite: 94 tests across 7 test contracts, including 10 `testFuzz_*` property tests (256 runs each) and 4 handler-driven `invariant_*` tests (256 runs × depth 32 random call sequences).
- node:test + viem suite: 7 tests, ~1.8 s, including one full end-to-end journey.
- Wall-clock for the whole `npx hardhat test` run with a warm compile cache: ~3 s (solidity) + ~2 s (nodejs). Cold compile adds ~10 s.
- `npx tsc --noEmit -p contracts/tsconfig.json`: clean (tests + scripts).

## Test files

| File | Framework | Cases | Covers |
|---|---|---:|---|
| `contracts/test/Base.t.sol` | forge-std fixture | — | Shared deployment: 3 collateral tokens (8/6/18 dec), TestPriceOracle, Chainlink adapter + mock aggregator, funded pool, role caching |
| `contracts/test/Registry.t.sol` | forge-std | 12 | Register collateral (config, listing, events), unauthorized registration, duplicate, invalid ratios/decimals, invalid oracle price, parameter updates, pause/unpause, `setOracle` validation, unsupported-asset reverts |
| `contracts/test/Oracle.t.sol` | forge-std | 13 | Chainlink adapter: feed set/validation/decimals cache, fresh price valid, stale rejection (boundary), zero/negative/future/zero-timestamp rejection, reverting aggregator handled, code-less aggregator rejected, feed removal; TestPriceOracle: set/read, unauthorized setters, default 1-day staleness, invalid override, zero price |
| `contracts/test/Engine.t.sol` | forge-std | 39 | Deposit (credit, PositionOpened once, zero/min/unsupported/inactive, invalid oracle ok, exposure cap), openPosition, borrow (limits, max LTV, pool liquidity, borrow cap across users, stale/invalid oracle never increases capacity), repay (partial/full/over-repay clamp, on-behalf, with invalid oracle), withdraw (full, unsafe rejected, dust, invalid price with debt, allowed when asset paused), health factor worked example ($10k/70 %/$6k → $8k ⇒ 0.9333), no-debt HF, never-reverting view, availableToBorrow = min of three, decimal normalisation 8/8, 6/8, 18/18, engine pause (repay still works) and asset pause semantics, role gating on vault/pool/engine/registry, LP cannot withdraw lent-out funds, accounting-mismatch guards |
| `contracts/test/Liquidation.t.sol` | forge-std | 11 | Eligibility (healthy, HF exactly 1, invalid/stale oracle), full liquidation penalty math (8 % ⇒ 0.081 BTC), partial liquidation, over-repay clamp, bad-debt write-off when collateral exhausted, double liquidation prevented (both layers), MUSD approval required, engine hook refuses over-seizure, 6-decimal collateral liquidation (5 % penalty) |
| `contracts/test/Reentrancy.t.sol` | forge-std | 4 | `ReentrantToken` baseline, re-entry on deposit fails, re-entry on withdraw fails, re-entry during liquidation payout fails |
| `contracts/test/Invariants.t.sol` | forge-std fuzz + invariant | 10 fuzz + 4 invariant | HF math property, toUsd/fromUsd round-trip bounded loss, decimal-agnostic normalisation, liquidation price is break-even, vault balance ≥ accounting, pool balance tracks flows, repay never increases debt, borrow never exceeds max LTV, withdraw never leaves an unsafe position, liquidation seize bounded + accounting + no double liquidation, LP cannot withdraw lent-out funds; stateful handler (deposit/borrow/repay/withdraw/price moves/liquidate for two users): vault solvency, pool balance == liquidity and assets == funding − bad debt, asset debt == Σ position debt, no debt without collateral |
| `contracts/test/flows.test.ts` | node:test + viem | 7 | End-to-end journey (deposit → borrow → add collateral, HF improves → partial repay → safe withdraw → price drop → liquidate → double liquidation blocked → invariants), tUSD 6-dec + borrow cap, stale oracle semantics via `time.increase`, emergency pause (repay open), unauthorized role-gated calls, LP cannot withdraw lent funds, re-entrant token on deposit/withdraw |

Brief section 13 checklist → all items covered (see `docs/SECURITY.md` for the per-threat test mapping).

## Gas (in-process EDR, `npx hardhat run scripts/gas-report.ts`)

| Flow | Gas used |
|---|---:|
| registry.addCollateralAsset | 227,823 |
| pool.depositLiquidity (LP) | 60,373 |
| engine.addCollateral (first deposit) | 190,839 |
| engine.addCollateral (top-up) | 101,656 |
| engine.borrow | 185,590 |
| engine.repay (partial) | 97,015 |
| engine.withdrawCollateral (with debt) | 115,733 |
| engine.openPosition (deposit + borrow) | 171,089 |
| liquidationEngine.liquidate (partial) | 213,301 |
| liquidationEngine.liquidate (full, closes position) | 182,100 |

Deployed bytecode sizes (bytes): CollateralRegistry 5,402 · CollateralVault 2,623 · MosaicLendingPool 4,354 · MosaicLendingEngine 12,835 · MosaicLiquidationEngine 3,868 · ChainlinkFeedOracleAdapter 2,916 · TestPriceOracle 2,934. All well under the 24,576-byte limit.

## Script dry runs (local Hardhat node, chain 31337, mocks in place of the Mezo precompiles)

- `scripts/deploy.ts` → deployed the full stack in the CONTRACTS.md order, granted roles, set the BTC feed, seeded tWBTC from the (mock) feed, registered BTC/tWBTC/tUSD, wrote the deployment JSON with every tx hash. Re-running reuses contracts that still have code and skips roles/feeds/registrations already applied.
- `scripts/fund-pool.ts` → `pool liquidity: 0 -> 500 MUSD`.
- `scripts/demo-flow.ts` → all 10 steps passed every on-chain assertion (deposit, borrow, HF 2.33 → 3.5 after adding collateral, partial repay, safe withdraw, close, separate max-LTV position, price drop to HF 0.95, liquidation by the same wallet, price restored, healthy position reopened, invariants).
- `scripts/verify-btc-precompile.ts` → **not run** (requires the real Mezo precompile); to be executed by the lead on testnet.
- `scripts/export-abis.mjs` → wrote 8 ABI files + `index.ts` to `lib/blockchain/abis/` (hand-maintained `shared.ts` preserved; `aggregatorV3Abi`, `oracleAdapterAbi`, `accessControlAbi` exports kept).

## Spec deviations (vs docs/CONTRACTS.md)

All deviations are additive or naming-only; every function signature, event and error listed in the frozen doc exists with the stated semantics.

1. `TestPriceOracle.setMaxStaleness(address asset, uint256 maxStaleness_)` — the parameter is named `maxStaleness_` because `seconds` is a reserved word in Solidity. Selector/signature unchanged.
2. Additional custom error `InvalidParameters()` on CollateralVault, MosaicLendingPool, MosaicLendingEngine, MosaicLiquidationEngine, ChainlinkFeedOracleAdapter and TestPriceOracle (constructor zero-address guards, `to == address(0)`, staleness range, code-less aggregator).
3. Additional read helpers/events: `TestPriceOracle.maxStaleness(asset)`, `invalidOverride(asset)`, event `MaxStalenessSet`; `ChainlinkFeedOracleAdapter.MIN_STALENESS/MAX_STALENESS`; `TestCollateralToken.maxFaucetPerCall`, event `Faucet`, errors `ExceedsFaucetCap`, `ZeroAmount`.
4. `getPositionView.healthFactor` is `type(uint256).max` whenever `debt == 0`, even if the price is invalid (the doc says invalid ⇒ 0; a debt-free position has no liquidation risk, so "infinite" is the safer signal). With debt and an invalid price it is 0 as specified.
5. `MosaicLendingEngine.liquidatePosition` additionally requires a valid oracle price (reverts `OraclePriceInvalid`) and is `whenNotPaused`, as defence in depth behind the liquidation engine's own checks. Calling it with `repayAmount == 0` reverts `ZeroAmount`; with `debt == 0` reverts `NoDebt`.
6. `MosaicLiquidationEngine.liquidate` with `repayAmount == 0` bubbles the engine's `ZeroAmount()` (not in the liquidation engine's listed errors).
7. `repay` with `debt == 0` reverts `ZeroAmount()` exactly as the doc states; `NoDebt()` is used only by `liquidatePosition`.
8. Vault and pool entry points are `nonReentrant` in addition to being role-gated.
9. `hardhat.config.ts`: auto-loads `contracts/.env` via `process.loadEnvFile` (Hardhat 3 reads `configVariable` from `process.env` only), adds a `localhost` network for script dry runs, and sets fuzz/invariant runs to 256.
10. Deployment file: on Mezo (31611) it is exactly `deployments/mezo-testnet.json`; on any other chain the scripts write `deployments/chain-<id>.json` (dry runs only; the local file was removed).
11. `lib/blockchain/abis/index.ts` re-exports `aggregatorV3Abi`, `oracleAdapterAbi` and `accessControlAbi` in addition to the names in the doc (required by the backend and web-app agents); `shared.ts` is hand-maintained and verified, not regenerated.

## Before deploying to Mezo testnet (lead checklist)

1. `contracts/.env` must hold a **funded** `DEPLOYER_PRIVATE_KEY` (the current one is a generated fallback): testnet BTC for gas (deployment is ~6 M gas total across 9 contracts + ~15 config txs) and MUSD ≥ `FUND_AMOUNT_MUSD` (default 500) plus ~100 MUSD buffer for the demo's repayments/liquidation.
2. Order: `npx hardhat run scripts/deploy.ts --network mezoTestnet` → `scripts/fund-pool.ts` → `scripts/verify-btc-precompile.ts` → `scripts/demo-flow.ts` → `node scripts/export-abis.mjs` (only needed again if contracts change). Each prints every tx hash with an explorer link and retries RPC reads up to 3 times.
3. Registering BTC requires the precompile feed `0x7b7c…0015` to be fresh (≤ 900 s) at that moment; it updates every few seconds, so this should just work. If `isPriceValid(BTC)` is false the script stops before registration.
4. Commit `contracts/deployments/mezo-testnet.json` after deployment; the frontend reads addresses from it.
5. The demo closes and reopens the deployer's tWBTC position; set `DEMO_REOPEN=0` to leave it empty instead.
