# Mosaic Vault — Security & Threat Model

> **Status: NOT AUDITED. Testnet MVP only.** These contracts have not been reviewed by an independent auditor and must not be used with real funds. Admin roles are held by a single EOA (the deployer). Everything below describes the intended defences and the tests that exercise them, not a guarantee.

Scope: `contracts/contracts/**` (CollateralRegistry, CollateralVault, MosaicLendingPool, MosaicLendingEngine, MosaicLiquidationEngine, ChainlinkFeedOracleAdapter, TestPriceOracle, MosaicMath) plus the off-chain surface listed in the product brief. Test names refer to `contracts/test/*.t.sol` (forge-std) and `contracts/test/flows.test.ts` (node:test + viem). Run with `cd contracts && npx hardhat test`.

## Trust model

| Actor | Trust | Powers |
|---|---|---|
| Deployer EOA (`DEFAULT_ADMIN_ROLE`, `RISK_MANAGER_ROLE`, `ORACLE_MANAGER_ROLE`, `PAUSER_ROLE`, `LIQUIDITY_PROVIDER_ROLE`) | Fully trusted | Register/pause assets, change risk parameters and oracles, set TestPriceOracle prices, pause the engine, fund/withdraw pool liquidity, grant roles |
| `MosaicLendingEngine` (`ENGINE_ROLE` on vault and pool) | Trusted code | The only contract that can move collateral out of the vault or MUSD out of the pool |
| `MosaicLiquidationEngine` (`LIQUIDATION_ENGINE_ROLE` on the engine) | Trusted code | The only caller of `engine.liquidatePosition` |
| Users / liquidators | Untrusted | Deposit, borrow, repay, withdraw, liquidate; approve the engine only |
| Oracles (Mezo BTC/USD precompile via adapter; TestPriceOracle for test tokens) | Conservatively trusted | Any failure, zero/negative answer or staleness is treated as "no price" |

Users approve exactly one spender: the engine. The vault and pool are never approved by users and never pull from users.

## Threats, mitigations, coverage

### 1. Reentrancy
- **Attack**: a malicious collateral token re-enters `addCollateral` / `withdrawCollateral` from inside `transferFrom` / `transfer`, or a liquidator re-enters during the collateral payout.
- **Impact**: double-crediting collateral, draining the vault.
- **Mitigation**: every state-changing user function on the engine, vault, pool and liquidation engine is `nonReentrant` (OpenZeppelin `ReentrancyGuard`); checks-effects-interactions ordering; deposits are credited from the vault's **balance delta**, not the requested amount.
- **Tests**: `ReentrancyTest.test_reentrancy_depositReentryFails`, `test_reentrancy_withdrawReentryFails`, `test_reentrancy_liquidationPathReentryFails`, `test_reentrancy_baselineDepositWithdrawWorks`; TS `re-entrant token cannot re-enter deposit or withdraw`.

### 2. Collateral accounting
- **Attack**: crediting more collateral than was received (fee-on-transfer, rebasing, or a token that lies in `transferFrom`), or withdrawing more than owned.
- **Impact**: under-collateralised debt; vault insolvency.
- **Mitigation**: engine credits `balanceAfter - balanceBefore`; `CollateralVault.depositCollateral` reverts `AccountingMismatch` unless `token.balanceOf(vault) >= total + amount`; `withdrawCollateral` reverts `InsufficientCollateral`; engine position and vault balance are updated together.
- **Tests**: `EngineTest.test_deposit_creditsPositionAndVault`, `test_pool_accountingMismatchGuards`, `test_withdraw_rejectsInsufficientZeroAndDust`; fuzz `InvariantsTest.testFuzz_depositWithdraw_vaultCoversAccounting`; stateful `StatefulInvariantTest.invariant_vaultBalanceCoversAccounting`.

### 3. Oracle manipulation / staleness / failure
- **Attack**: stale, zero, negative or reverting feed answers used to borrow against inflated collateral, to block liquidations, or to liquidate healthy positions.
- **Impact**: bad debt or unfair liquidations.
- **Mitigation**: validity = `price > 0 && updatedAt > 0 && updatedAt <= now && now - updatedAt <= maxStaleness && feed did not revert` (adapter reads `latestRoundData` in `try/catch`, rejects code-less aggregators, does not rely on `answeredInRound` which the Mezo precompile returns as 0). An invalid price **blocks** borrow, withdraw-with-debt and liquidation and zeroes `availableToBorrow`; deposit and repay always work. A failure can never increase capacity. Oracle changes require `RISK_MANAGER_ROLE` and the new oracle must already report a valid price.
- **Tests**: `OracleTest.test_feed_staleRejected`, `test_feed_zeroAndNegativeRejected`, `test_feed_revertingAggregatorIsInvalidNotReverting`, `test_feed_unsetOrCodelessAggregatorIsInvalid`, `test_testOracle_stalenessDefaultOneDay`, `test_testOracle_setInvalidOverride`; `EngineTest.test_borrow_staleOracleRejected`, `test_borrow_invalidOracleNeverIncreasesCapacity`, `test_withdraw_withDebtRequiresValidPrice`, `test_deposit_worksWithInvalidOracle`, `test_repay_worksWithInvalidOracle`, `test_healthFactor_revertsOnInvalidPriceWithDebt`; `LiquidationTest.test_eligibility_invalidOracleBlocksLiquidation`; `RegistryTest.test_registerCollateral_rejectsInvalidOraclePrice`, `test_setOracle_requiresValidPrice`; TS `stale oracle blocks borrow and withdraw-with-debt but not deposit or repay`.
- **Residual risk**: `TestPriceOracle` prices are admin-set by design (test-only tokens, labelled on-chain via `LABEL`). The BTC feed is the Mezo precompile; its own liveness is outside our control (staleness 900 s).

### 4. Decimal errors
- **Attack**: mixing 6/8/18-decimal tokens with 8/18-decimal prices to mis-value collateral.
- **Impact**: over-borrowing by orders of magnitude.
- **Mitigation**: all USD maths goes through `MosaicMath.toUsd/fromUsd` with explicit `tokenDecimals` (read from the token at registration, `<= 18`) and `priceDecimals` (from the adapter); `Math.mulDiv` avoids overflow; `getPositionView.price` is normalised to 18 decimals.
- **Tests**: `EngineTest.test_decimals_8decToken8decFeed`, `test_decimals_6decToken8decFeed`, `test_decimals_18decToken18decFeed`; `LiquidationTest.test_liquidation_sixDecimalCollateral`; fuzz `testFuzz_toUsdFromUsdRoundTrip`, `testFuzz_decimalNormalisationAgreesAcrossDecimals`, `testFuzz_liquidationPriceIsBreakEven`; `RegistryTest.test_registerCollateral_rejectsDecimalsAbove18`; TS `six-decimal tUSD collateral normalises correctly`.

### 5. Excessive borrowing
- **Attack**: borrow above max LTV, above the per-asset borrow cap, or more than the pool holds.
- **Mitigation**: `borrow` enforces `newDebt <= collateralUsd * maxLtv`, `assetDebt + amount <= borrowCap`, `amount <= pool liquidity`; `withdrawCollateral` re-checks HF >= 1 **and** `debt <= maxDebt(remaining)`.
- **Tests**: `EngineTest.test_borrow_aboveMaxLtvRejected`, `test_borrow_capEnforcedAcrossUsers`, `test_borrow_insufficientPoolLiquidity`, `test_withdraw_unsafeRejected`, `test_positionView_availableToBorrowIsMinOfThree`; fuzz `testFuzz_borrowNeverExceedsMaxLtv`, `testFuzz_withdrawNeverLeavesUnsafePosition`.

### 6. Liquidation eligibility
- **Attack**: liquidating a healthy position, or being unable to liquidate an unhealthy one.
- **Mitigation**: `isLiquidatable` is true iff `debt > 0 && priceValid && HF < 1e18`; `liquidate` reverts `NotLiquidatable` / `OraclePriceInvalid`; `HF = collateralUsd * liqThreshold / debt` (worked example: $10,000 collateral, 70 %, $6,000 debt, price to $8,000 → HF 0.9333).
- **Tests**: `EngineTest.test_healthFactor_workedExample`; `LiquidationTest.test_eligibility_healthyNotLiquidatable`, `test_eligibility_exactlyOneIsNotLiquidatable`, `test_execution_fullLiquidationPenaltyMath`, `test_execution_partialLiquidationLeavesHealthierPosition`; fuzz `testFuzz_healthFactorMath`, `testFuzz_liquidationSeizeBoundedAndAccountingHolds`.

### 7. Double liquidation / over-seizure
- **Attack**: liquidating a closed position again, repaying more than the debt, or seizing more than the collateral.
- **Mitigation**: `debtToRepay = min(repayAmount, debt)`, `collateralToSeize = min(fromUsd(debt*(1+penalty)), collateral)`; a position with `debt == 0` is never liquidatable; the engine hook reverts `NoDebt` / `InsufficientCollateral`; when collateral hits 0 with debt left, the remainder is written off (`BadDebtWrittenOff`) so the position cannot be touched again.
- **Tests**: `LiquidationTest.test_doubleLiquidation_prevented`, `test_execution_overRepayClampsToDebt`, `test_badDebt_writtenOffWhenCollateralExhausted`, `test_liquidation_engineHookRefusesSeizingMoreThanCollateral`; TS journey step 9.

### 8. Unauthorized withdrawal / role abuse by outsiders
- **Attack**: calling vault/pool/engine privileged functions directly.
- **Mitigation**: OpenZeppelin `AccessControl` on every privileged function (`ENGINE_ROLE`, `LIQUIDATION_ENGINE_ROLE`, `RISK_MANAGER_ROLE`, `ORACLE_MANAGER_ROLE`, `PAUSER_ROLE`, `LIQUIDITY_PROVIDER_ROLE`); positions are keyed by `msg.sender`; `withdrawCollateral(to)` only moves the caller's own collateral.
- **Tests**: `EngineTest.test_roles_vaultOnlyEngine`, `test_roles_poolGating`, `test_roles_engineLiquidatePositionOnlyLiquidationEngine`, `test_roles_adminCanGrantAndRevoke`, `test_pause_unauthorized`; `RegistryTest.test_registerCollateral_rejectsUnauthorized`, `test_updateParameters_rejectsUnauthorizedAndUnsupported`, `test_pause_rejectsUnauthorized`, `test_setOracle_requiresValidPrice`; `OracleTest.test_feed_setFeedValidation`, `test_feed_removeFeedInvalidates`, `test_testOracle_unauthorizedSetters`; TS `unauthorized accounts cannot touch role-gated functions`.

### 9. Pool insolvency / LP withdrawing lent funds
- **Attack**: an LP withdraws MUSD that is lent out; accounting drifts from the real MUSD balance.
- **Mitigation**: `withdrawLiquidity` is capped by `musd.balanceOf(pool)`; `getAvailableLiquidity` **is** the balance; `receiveRepayment`/`writeOffBadDebt` revert `AccountingMismatch` if they would exceed outstanding debt; bad debt is tracked in `totalBadDebt` and reduces `getTotalPoolAssets` transparently.
- **Tests**: `EngineTest.test_pool_lpCannotWithdrawLentOutFunds`, `test_pool_accountingMismatchGuards`; fuzz `testFuzz_lpCannotWithdrawLentOutFunds`, `testFuzz_borrowRepay_poolBalanceTracksFlows`; stateful `invariant_poolBalanceEqualsLiquidityAndAssetsTrackFunding`, `invariant_assetDebtEqualsSumOfPositionDebt`; TS `LP cannot withdraw lent-out funds`.
- **Residual risk**: liquidity providers absorb bad debt pro-rata with no interest income (0 % MVP). The pool is a single shared MUSD pot.

### 10. Approval risks
- **Attack**: users approve the wrong contract, or an unlimited approval is abused by a compromised contract.
- **Mitigation**: the engine is the single spender for collateral and MUSD; the vault and pool never call `transferFrom` on users; the engine only pulls the exact amount needed (`min(amount, debt)` for repay); the demo scripts and UI approve the engine only.
- **Tests**: TS journey asserts `allowance(user, vault) == 0`; `LiquidationTest.test_liquidation_requiresMusdApproval`; `EngineTest.test_repay_partialFullAndOverRepayClamps` (only the debt is pulled).
- **Residual risk**: the UI may request unlimited approvals for convenience; a compromised admin could not drain approvals because the engine is immutable and non-upgradeable, but a future engine re-deployment would need fresh approvals.

### 11. Malicious / fee-on-transfer / non-standard tokens
- **Attack**: registering a token whose `transferFrom` under-delivers, reverts, returns false, or re-enters.
- **Mitigation**: only `RISK_MANAGER_ROLE` can register; `SafeERC20` handles missing return values; balance-delta crediting means fee-on-transfer tokens are credited with what arrived; `ReentrancyGuard` covers hooks; `decimals() > 18` is rejected.
- **Tests**: `ReentrancyTest.*`, `EngineTest.test_deposit_creditsPositionAndVault`, `RegistryTest.test_registerCollateral_rejectsDecimalsAbove18`.
- **Residual risk**: rebasing tokens would break vault accounting (balance can fall below totals); do not list them. Not supported by design.

### 12. Exposure limits
- **Attack**: concentrating protocol risk in one asset.
- **Mitigation**: per-asset `maxExposure` (token units) checked on every deposit; per-asset `borrowCap` (MUSD) checked on every borrow; both only changeable by `RISK_MANAGER_ROLE`.
- **Tests**: `EngineTest.test_deposit_exposureCap`, `test_borrow_capEnforcedAcrossUsers`; TS `six-decimal tUSD ... respects its own caps`.

### 13. Admin abuse / key compromise
- **Attack**: the deployer EOA sets absurd risk parameters, points an asset at a fake oracle, sets a TestPriceOracle price to 0, or drains the pool via `withdrawLiquidity`.
- **Mitigation**: parameter validation (`0 < maxLtv < liqThreshold <= 95 %`, `penalty <= 30 %`); new oracles must report a valid price; the admin **cannot** move user collateral (no vault role) or seize positions (no `LIQUIDATION_ENGINE_ROLE`); pool withdrawals are limited to idle liquidity; all admin actions emit events.
- **Tests**: `RegistryTest.test_registerCollateral_rejectsInvalidRatios`, `test_updateParameters_rejectsUnauthorizedAndUnsupported`; `EngineTest.test_roles_engineLiquidatePositionOnlyLiquidationEngine` (admin is refused).
- **Residual risk (known limitation)**: a single EOA holds every admin role; there is no timelock or multisig. A compromised key can pause the protocol, set test-token prices and change risk parameters within the validated ranges. Acceptable only on testnet.

### 14. Pause behaviour
- **Attack**: an emergency pause that traps users' ability to reduce risk, or a pause that fails to stop new risk.
- **Mitigation**: engine `pause()` (PAUSER_ROLE) blocks deposit, borrow, withdraw and liquidation; **repay stays open**. Asset-level `Paused` blocks new deposits/borrows for that asset while repay, withdraw and liquidate still work. `availableToBorrow` reports 0 in both cases.
- **Tests**: `EngineTest.test_pause_blocksDepositBorrowWithdrawLiquidateButRepayWorks`, `test_assetPaused_blocksBorrowDepositAllowsRepayWithdrawLiquidate`, `test_withdraw_allowedWhenAssetPaused`, `test_positionView_availableToBorrowIsMinOfThree`; `RegistryTest.test_pauseUnpause_changesStatus`; TS `emergency pause keeps repay open and blocks everything else`.

### 15. Event indexing integrity
- **Attack**: an indexer that trusts off-chain state, misses events, or is fed fake events.
- **Mitigation**: every state change emits an indexed event with the resulting balance (`CollateralAdded(.., newCollateral)`, `Borrowed(.., newDebt)`, `Repaid(.., newDebt)`, `PositionLiquidated(.., badDebt)`); contracts are the source of truth and views (`getPositionView`) never revert so the UI can always re-derive state from chain.
- **Tests**: event assertions in `EngineTest.test_deposit_creditsPositionAndVault`, `test_borrow_withinLimitsEmitsAndLends`, `test_repay_partialFullAndOverRepayClamps`, `test_repayOnBehalf_payerIsCaller`, `test_withdraw_noDebtFullWithdrawal`; `LiquidationTest.test_execution_fullLiquidationPenaltyMath`, `test_badDebt_writtenOffWhenCollateralExhausted`; TS `emitWithArgs` for `Borrowed` and `Liquidation`. Indexer correctness itself: not covered on-chain; backend/web.

### 16. Auth replay (wallet-signature login)
- Not covered on-chain; backend/web. Mitigation per ARCHITECTURE.md: SIWE-style message with nonce + expiry, nonce single-use, httpOnly session cookie.

### 17. RLS bypass (Supabase)
- Not covered on-chain; backend/web. Supabase is index/metadata only; contracts remain the source of truth, so a bypass can leak or corrupt cached data but cannot move funds.

### 18. API auth bypass
- Not covered on-chain; backend/web. Indexer trigger guarded by a secret; manager-only routes verify on-chain `hasRole` via `accessControlAbi`.

### 19. Secret leakage
- Not covered on-chain; backend/web/ops. `contracts/.env` (deployer key) is git-ignored; scripts never print the key; the deployment file contains only public addresses and tx hashes.

## Design notes that matter for security

- **Isolated positions**: one `(user, asset)` position each; a collapse in one asset cannot drag another position down.
- **No MUSD minting**: the protocol lends MUSD that LPs deposited; it never touches Mezo's CDP system.
- **Conservative views**: `getPositionView` never reverts and reports `priceValid=false` with zero USD fields; `getHealthFactor` reverts on an invalid price when there is debt so callers cannot mistake "unknown" for "healthy".
- **Defence in depth on liquidation**: the liquidation engine checks eligibility; the lending engine independently re-checks price validity, role, debt > 0 and seize <= collateral.
- **Immutable wiring**: `registry`, `vault`, `pool`, `musd` are `immutable` on the engine; no proxies, no upgrades.

## Known limitations (MVP)

- 0 % interest; LPs earn nothing and absorb bad debt.
- Single shared MUSD pool; one liquidity-provider role (the deployer).
- Isolated positions only; no cross-collateral.
- Admin keys are a single EOA with no timelock or multisig.
- `TestPriceOracle` and `TestCollateralToken` are test-only and labelled as such on-chain; tWBTC/tUSD have no value.
- Liquidations are "repay-up-to-full"; there is no close factor, so a liquidator may repay 100 % of the debt.
- No oracle deviation or circuit-breaker checks beyond staleness and sign.
- Not audited. Testnet only.

## Audit remediation (2026-11-12)

An AI-assisted review (Pashov `solidity-auditor` skill, 2 passes, 12 agents each) raised 8 findings and 35 leads. The report is kept locally in `.solidity-auditor/runs/20261112-160201/full-report.md`. It is not a substitute for a professional audit.

| Finding | Status | Fix | Regression test |
|---|---|---|---|
| 1-3. A partial repay seizes all collateral, so the pool writes off debt that the collateral covers | Fixed | `MosaicLiquidationEngine._quote`: on a solvent position the bonus is capped at the borrower's equity, so the liquidator seizes at most the repaid share of collateral. `MosaicLendingEngine.liquidatePosition` also reverts a write-off unless the collateral is worth less than the debt. | `test/AuditFixes.t.sol` (5 tests + 256-run fuzz) |
| 4. Anyone mints test collateral and borrows real MUSD | Fixed | `TestCollateralToken.faucet` and `mintTo` require `MINTER_ROLE` (the deployer). The web app shows minting only to minters. | `test_testToken_faucetIsMinterOnly` |
| 7. A liquidator leaves one unit of collateral and skips the write-off | Fixed by the finding 1-3 change: the remaining debt stays backed at the original collateral ratio | `test_solventPosition_dustLeftoverStillBacked` |
| 5-6. One account fills the exposure cap or the borrow cap | Accepted for the testnet MVP | Caps are small on purpose; per-position limits are future work | — |
| 8. The first liquidity provider to exit avoids bad debt | Accepted for the testnet MVP | The pool has one team-controlled provider; share accounting is future work | — |

Liquidations of underwater positions (collateral worth less than the debt) still write off the shortfall, and the liquidator keeps the penalty. That penalty is paid by the pool, which is the standard trade-off that keeps underwater positions liquidatable.
