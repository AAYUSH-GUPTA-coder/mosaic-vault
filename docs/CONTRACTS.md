# Mosaic Vault — Contract Interfaces (FROZEN 2026-11-06)

Solidity 0.8.28, OpenZeppelin v5 (`AccessControl`, `ReentrancyGuard`, `Pausable`, `SafeERC20`, `Math`), evm `london`, optimizer 200 runs. Hardhat 3 (`@nomicfoundation/hardhat-toolbox-viem`). All USD values are **18-decimal fixed point** (same unit as MUSD). All ratios are **basis points** (`10_000` = 100%). Health factor is **WAD** (`1e18` = 1.0).

Custom errors everywhere (no revert strings). All state-changing user functions are `nonReentrant`. Checks-effects-interactions.

## Shared types — `contracts/contracts/interfaces/IMosaicTypes.sol`

```solidity
enum AssetStatus { None, Active, Paused }       // Paused: no new deposits/borrows; repay, withdraw, liquidate still allowed
enum AssetKind { VerifiedExternal, TestOnly }    // UI labelling only

struct CollateralConfig {
    address token;
    address oracle;                 // IPriceOracleAdapter
    uint8   decimals;               // token decimals (<= 18)
    uint16  maxLtvBps;              // 0 < maxLtv < liquidationThreshold
    uint16  liquidationThresholdBps;// <= 9_500
    uint16  liquidationPenaltyBps;  // <= 3_000
    uint256 borrowCap;              // max total debt (MUSD, 18 dec) against this asset
    uint256 maxExposure;            // max total collateral deposited (token units)
    uint256 minDeposit;             // minimum resulting collateral for a position (token units)
    AssetStatus status;
    AssetKind kind;
    uint64  lastUpdated;            // block.timestamp of last config write
}

struct Position { uint256 collateral; uint256 debt; uint64 lastUpdated; }   // isolated per (user, asset)

struct PositionView {                // never reverts; priceValid=false => all USD fields are 0 and healthFactor = 0
    uint256 collateral;              // token units
    uint256 debt;                    // MUSD 18 dec
    uint256 collateralValueUsd;      // 18 dec
    uint256 maxDebtUsd;              // collateralValueUsd * maxLtv
    uint256 availableToBorrow;       // min(maxDebt - debt, pool liquidity, borrowCap - assetDebt), 0 if paused/invalid
    uint256 healthFactor;            // WAD; type(uint256).max when debt == 0
    uint256 liquidationPrice;        // USD per whole token, 18 dec; 0 when debt == 0
    uint256 currentLtvBps;           // debt / collateralValue in bps; 0 when no collateral
    uint256 price;                   // oracle price normalised to 18 dec
    uint256 priceUpdatedAt;
    bool    priceValid;
}
```

## `IPriceOracleAdapter` — `contracts/contracts/interfaces/IPriceOracleAdapter.sol`

```solidity
struct PriceData { uint256 price; uint8 decimals; uint256 updatedAt; bool valid; }
function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt); // reverts OraclePriceInvalid(asset) when !valid
function getPriceDecimals(address asset) external view returns (uint8);
function isPriceValid(address asset) external view returns (bool);                           // never reverts
function getPriceData(address asset) external view returns (PriceData memory);               // never reverts
error OraclePriceInvalid(address asset);
```
Validity = price > 0 AND updatedAt > 0 AND block.timestamp - updatedAt <= maxStaleness AND feed call did not revert.

### `ChainlinkFeedOracleAdapter` (verified feeds)
- `constructor(address admin)`; roles: `DEFAULT_ADMIN_ROLE`, `ORACLE_MANAGER_ROLE`.
- `setFeed(address asset, address aggregator, uint256 maxStaleness)` — `ORACLE_MANAGER_ROLE`; reads `decimals()` from the aggregator and caches it; `maxStaleness` in [30, 86_400]. Emits `FeedSet(asset, aggregator, decimals, maxStaleness)`.
- `removeFeed(address asset)` — `ORACLE_MANAGER_ROLE`. Emits `FeedRemoved(asset)`.
- `feeds(address asset) returns (address aggregator, uint8 decimals, uint256 maxStaleness)`.
- Reads `latestRoundData()` inside `try/catch`; **does not** check `answeredInRound` (Mezo precompile returns 0); rejects `answer <= 0`.
- Minimal `IAggregatorV3 { decimals(); latestRoundData() returns (uint80,int256,uint256,uint256,uint80); }`.

### `TestPriceOracle` (explicitly test-only)
- `constructor(address admin)`; roles: `DEFAULT_ADMIN_ROLE`, `ORACLE_MANAGER_ROLE`.
- `setPrice(address asset, uint256 price, uint8 decimals)` — `ORACLE_MANAGER_ROLE`; sets `updatedAt = block.timestamp`. Emits `PriceSet(asset, price, decimals, updatedAt)`.
- `setMaxStaleness(address asset, uint256 seconds)` (default 1 day) — `ORACLE_MANAGER_ROLE`.
- `setInvalid(address asset, bool invalid)` — forces `valid=false` for failure demos. Emits `ValidityOverridden(asset, invalid)`.
- `string public constant LABEL = "TEST-ONLY ORACLE: admin-set prices, not market data";`

## `CollateralRegistry`

Roles: `DEFAULT_ADMIN_ROLE`, `RISK_MANAGER_ROLE`.

```solidity
function addCollateralAsset(address token, address oracle, AssetKind kind, uint16 maxLtvBps, uint16 liquidationThresholdBps, uint16 liquidationPenaltyBps, uint256 borrowCap, uint256 maxExposure, uint256 minDeposit) external; // RISK_MANAGER; status=Active; decimals read from token; oracle.isPriceValid(token) must be true; reverts AssetAlreadyRegistered
function updateCollateralParameters(address token, uint16 maxLtvBps, uint16 liquidationThresholdBps, uint16 liquidationPenaltyBps, uint256 borrowCap, uint256 maxExposure, uint256 minDeposit) external; // RISK_MANAGER
function setOracle(address token, address oracle) external;          // RISK_MANAGER; new oracle must report a valid price
function pauseCollateralAsset(address token) external;                // RISK_MANAGER
function unpauseCollateralAsset(address token) external;              // RISK_MANAGER
function getCollateralConfig(address token) external view returns (CollateralConfig memory); // reverts AssetNotSupported if status == None
function isSupportedCollateral(address token) external view returns (bool);   // status != None
function isActive(address token) external view returns (bool);                // status == Active
function listAssets() external view returns (address[] memory);               // registration order
function assetCount() external view returns (uint256);
```
Validation (`InvalidParameters()`): `0 < maxLtv < liqThreshold <= 9_500`, `penalty <= 3_000`, `decimals <= 18`, `token != 0`, `oracle != 0`.
Events: `CollateralAssetAdded(address indexed token, address indexed oracle, AssetKind kind)`, `CollateralParametersUpdated(address indexed token, uint16 maxLtvBps, uint16 liquidationThresholdBps, uint16 liquidationPenaltyBps, uint256 borrowCap, uint256 maxExposure, uint256 minDeposit)`, `OracleUpdated(address indexed token, address indexed oracle)`, `CollateralAssetPaused(address indexed token)`, `CollateralAssetUnpaused(address indexed token)`.
Errors: `AssetAlreadyRegistered(address)`, `AssetNotSupported(address)`, `InvalidParameters()`, `OraclePriceInvalid(address)`.

## `CollateralVault`

Roles: `DEFAULT_ADMIN_ROLE`, `ENGINE_ROLE` (granted to `MosaicLendingEngine` only). Tokens arrive by the engine transferring them here; the vault only does accounting and outbound transfers.

```solidity
function depositCollateral(address asset, address user, uint256 amount) external;              // ENGINE_ROLE; accounting only; requires token.balanceOf(this) >= totalCollateral[asset] + amount
function withdrawCollateral(address asset, address user, address to, uint256 amount) external; // ENGINE_ROLE; safeTransfer out; reverts InsufficientCollateral
function getCollateralBalance(address user, address asset) external view returns (uint256);
function getTotalCollateral(address asset) external view returns (uint256);
```
Events: `CollateralDeposited(address indexed user, address indexed asset, uint256 amount)`, `CollateralWithdrawn(address indexed user, address indexed asset, address indexed to, uint256 amount)`.
Errors: `InsufficientCollateral()`, `AccountingMismatch()`.
Invariant: `token.balanceOf(vault) >= totalCollateral[token]` for every asset.

## `MosaicLendingPool`

Roles: `DEFAULT_ADMIN_ROLE`, `ENGINE_ROLE` (engine only), `LIQUIDITY_PROVIDER_ROLE`. `constructor(address musd, address admin)`.

```solidity
function depositLiquidity(uint256 amount) external;                      // LP role; pulls MUSD from msg.sender (approve pool)
function withdrawLiquidity(uint256 amount, address to) external;         // LP role; amount <= getAvailableLiquidity(); reverts InsufficientLiquidity
function lendToBorrower(address asset, address to, uint256 amount) external;   // ENGINE; transfers MUSD; outstandingDebt[asset] += amount; totalOutstandingDebt += amount
function receiveRepayment(address asset, uint256 amount) external;      // ENGINE; accounting only (engine already transferred MUSD to pool); debt -= amount
function writeOffBadDebt(address asset, uint256 amount) external;        // ENGINE; debt -= amount; totalBadDebt += amount
function getAvailableLiquidity() external view returns (uint256);       // musd.balanceOf(this)
function getTotalOutstandingDebt() external view returns (uint256);
function getOutstandingDebt(address asset) external view returns (uint256);
function getTotalPoolAssets() external view returns (uint256);          // available + outstanding debt
function totalBadDebt() external view returns (uint256);
function musd() external view returns (address);
```
Events: `LiquidityDeposited(address indexed provider, uint256 amount)`, `LiquidityWithdrawn(address indexed provider, address indexed to, uint256 amount)`, `Lent(address indexed asset, address indexed borrower, uint256 amount)`, `RepaymentReceived(address indexed asset, uint256 amount)`, `BadDebtWrittenOff(address indexed asset, uint256 amount)`.
Errors: `InsufficientLiquidity()`, `ZeroAmount()`, `AccountingMismatch()`.

## `MosaicLendingEngine`

Roles: `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, `LIQUIDATION_ENGINE_ROLE`. `Pausable` (emergency: blocks deposit/borrow/withdraw/liquidation; repay stays open). `constructor(address registry, address vault, address pool, address musd, address admin)`. Immutable `registry`, `vault`, `pool`, `musd`.

Users approve **the engine** for collateral tokens and for MUSD.

```solidity
function openPosition(address asset, uint256 collateralAmount, uint256 borrowAmount) external; // addCollateral then (if borrowAmount>0) borrow
function addCollateral(address asset, uint256 amount) external;      // asset Active; whenNotPaused; resulting collateral >= minDeposit; totalCollateral+amount <= maxExposure; credits amount actually received (balance delta on vault)
function borrow(address asset, uint256 amount) external;             // asset Active; price valid; newDebt <= maxDebtUsd; assetDebt+amount <= borrowCap; amount <= pool liquidity
function repay(address asset, uint256 amount) external;              // works while paused; amount = min(amount, debt); reverts ZeroAmount if debt == 0
function repayOnBehalf(address user, address asset, uint256 amount) external; // same, payer = msg.sender
function withdrawCollateral(address asset, uint256 amount, address to) external; // whenNotPaused; price valid if debt > 0; after withdrawal HF >= 1e18 AND debt <= maxDebtUsd(remaining) ; remaining collateral is 0 or >= minDeposit
function getPosition(address user, address asset) external view returns (Position memory);
function getPositionView(address user, address asset) external view returns (PositionView memory); // never reverts
function getHealthFactor(address user, address asset) external view returns (uint256);          // reverts OraclePriceInvalid when debt > 0 and price invalid
function getBorrowingCapacity(address user, address asset) external view returns (uint256);     // availableToBorrow
function getLiquidationPrice(address user, address asset) external view returns (uint256);
function getOutstandingDebt(address user, address asset) external view returns (uint256);
function getCollateralValue(address user, address asset) external view returns (uint256);       // reverts if price invalid
function getAssetDebt(address asset) external view returns (uint256);                            // pool.getOutstandingDebt(asset)
function liquidatePosition(address user, address asset, address liquidator, uint256 repayAmount, uint256 seizeAmount) external; // LIQUIDATION_ENGINE_ROLE only; pulls repayAmount MUSD from liquidator -> pool; debt -= repay; collateral -= seize (vault -> liquidator); if collateral == 0 && debt > 0 => writeOffBadDebt(remaining) and debt = 0
function pause() / unpause()  // PAUSER_ROLE
```
Events: `PositionOpened(address indexed user, address indexed asset)` (first deposit), `CollateralAdded(address indexed user, address indexed asset, uint256 amount, uint256 newCollateral)`, `CollateralWithdrawn(address indexed user, address indexed asset, address indexed to, uint256 amount, uint256 newCollateral)`, `Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 newDebt)`, `Repaid(address indexed user, address indexed asset, address indexed payer, uint256 amount, uint256 newDebt)`, `PositionLiquidated(address indexed user, address indexed asset, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized, uint256 badDebt)`.
Errors: `AssetNotActive(address)`, `OraclePriceInvalid(address)`, `ExceedsMaxLtv()`, `ExceedsBorrowCap()`, `ExceedsExposureCap()`, `InsufficientPoolLiquidity()`, `BelowMinDeposit()`, `UnsafeWithdrawal()`, `InsufficientCollateral()`, `ZeroAmount()`, `NoDebt()`.

## `MosaicLiquidationEngine`

`constructor(address engine, address registry, address musd)`; permissionless. Liquidator approves **the lending engine** for MUSD (the engine pulls).

```solidity
function isLiquidatable(address user, address asset) external view returns (bool);  // false if price invalid or debt == 0; true iff HF < 1e18
function getLiquidationQuote(address user, address asset, uint256 repayAmount) external view returns (uint256 debtToRepay, uint256 collateralToSeize, uint256 price, bool liquidatable);
function liquidate(address user, address asset, uint256 repayAmount) external;        // nonReentrant; reverts NotLiquidatable(), OraclePriceInvalid
```
Rules: `debtToRepay = min(repayAmount, debt)`; `seizeUsd = debtToRepay * (10_000 + penalty) / 10_000`; `collateralToSeize = min(fromUsd(seizeUsd, price), collateral)`. Calls `engine.liquidatePosition(user, asset, msg.sender, debtToRepay, collateralToSeize)`. A position with `debt == 0` is never liquidatable, so a second liquidation of a closed position reverts `NotLiquidatable()`.
Event: `Liquidation(address indexed user, address indexed asset, address indexed liquidator, uint256 debtRepaid, uint256 collateralSeized, uint256 price)`.

## `MosaicMath` (internal library)

```solidity
uint256 constant WAD = 1e18; uint256 constant BPS = 10_000;
toUsd(amount, tokenDecimals, price, priceDecimals) = mulDiv(amount * WAD, price, 10**(tokenDecimals + priceDecimals))
fromUsd(usd, tokenDecimals, price, priceDecimals)  = mulDiv(usd, 10**(tokenDecimals + priceDecimals), price * WAD)
maxDebt(collateralUsd, maxLtvBps)                   = collateralUsd * maxLtvBps / BPS
healthFactor(collateralUsd, liqThresholdBps, debt)  = debt == 0 ? type(uint256).max : mulDiv(collateralUsd * liqThresholdBps, WAD, debt * BPS)
liquidationPrice(debt, collateral, tokenDecimals, liqThresholdBps) = collateral == 0 || debt == 0 ? 0 : mulDiv(debt * BPS, 10**tokenDecimals, collateral * liqThresholdBps)   // 18-dec USD per whole token
ltvBps(debt, collateralUsd)                         = collateralUsd == 0 ? 0 : debt * BPS / collateralUsd
```

## Test helpers (`contracts/contracts/test/`)
- `MockERC20(name, symbol, decimals)` with `mint(to, amount)`.
- `TestCollateralToken(name, symbol, decimals, maxFaucetPerCall)` — public `faucet(uint256 amount)` mint capped per call (test-only, deployed on testnet); `string constant LABEL = "TEST-ONLY TOKEN: no value, free faucet"`.
- `MockAggregatorV3(decimals)` with `setAnswer(int256, uint256 updatedAt)`, `setRevert(bool)`.
- `ReentrantToken` for reentrancy tests.

## Deployment order (scripts/deploy.ts) and `deployments/mezo-testnet.json`

Registry → ChainlinkFeedOracleAdapter → TestPriceOracle → Pool → Vault → Engine → LiquidationEngine → test tokens → roles (`ENGINE_ROLE` on vault+pool to engine; `LIQUIDATION_ENGINE_ROLE` on engine to liquidation engine; `RISK_MANAGER_ROLE`, `LIQUIDITY_PROVIDER_ROLE`, `PAUSER_ROLE`, `ORACLE_MANAGER_ROLE` to deployer) → feeds → register assets → fund pool. Output JSON shape:

```json
{ "chainId": 31611, "deployer": "0x..", "deployedAt": "ISO", "contracts": { "CollateralRegistry": "0x..", "ChainlinkFeedOracleAdapter": "0x..", "TestPriceOracle": "0x..", "MosaicLendingPool": "0x..", "CollateralVault": "0x..", "MosaicLendingEngine": "0x..", "MosaicLiquidationEngine": "0x.." }, "tokens": { "MUSD": "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503", "BTC": "0x7b7C000000000000000000000000000000000000", "tWBTC": "0x..", "tUSD": "0x.." }, "feeds": { "BTC": "0x7b7c000000000000000000000000000000000015" }, "txs": { "...": "0x.." } }
```

## ABI export

`contracts/scripts/export-abis.mjs` writes `lib/blockchain/abis/<ContractName>.ts` as `export const <camelName>Abi = [...] as const;` for: CollateralRegistry, CollateralVault, MosaicLendingPool, MosaicLendingEngine, MosaicLiquidationEngine, ChainlinkFeedOracleAdapter, TestPriceOracle, TestCollateralToken, plus `erc20Abi` is taken from viem. Also writes `lib/blockchain/abis/index.ts`.
