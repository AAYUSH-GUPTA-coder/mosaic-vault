// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMosaicLendingEngine} from "./interfaces/IMosaicLendingEngine.sol";
import {ICollateralRegistry} from "./interfaces/ICollateralRegistry.sol";
import {ICollateralVault} from "./interfaces/ICollateralVault.sol";
import {IMosaicLendingPool} from "./interfaces/IMosaicLendingPool.sol";
import {IPriceOracleAdapter} from "./interfaces/IPriceOracleAdapter.sol";
import {MosaicMath} from "./libraries/MosaicMath.sol";

/// @title MosaicLendingEngine
/// @notice Single user entry point: deposit collateral, borrow MUSD, repay, withdraw. Positions are isolated per
///         (user, asset). The engine is the only spender users approve (collateral tokens and MUSD).
///         Emergency pause blocks deposit/borrow/withdraw/liquidation; repay stays open.
contract MosaicLendingEngine is AccessControl, ReentrancyGuard, Pausable, IMosaicLendingEngine {
    using SafeERC20 for IERC20;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant LIQUIDATION_ENGINE_ROLE = keccak256("LIQUIDATION_ENGINE_ROLE");

    error InvalidParameters();

    ICollateralRegistry public immutable registry;
    ICollateralVault public immutable vault;
    IMosaicLendingPool public immutable pool;
    IERC20 public immutable musd;

    /// @dev user => asset => position
    mapping(address => mapping(address => Position)) private _positions;

    constructor(address registry_, address vault_, address pool_, address musd_, address admin) {
        if (
            registry_ == address(0) || vault_ == address(0) || pool_ == address(0) || musd_ == address(0)
                || admin == address(0)
        ) revert InvalidParameters();
        registry = ICollateralRegistry(registry_);
        vault = ICollateralVault(vault_);
        pool = IMosaicLendingPool(pool_);
        musd = IERC20(musd_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Adds collateral, then borrows if `borrowAmount > 0`.
    function openPosition(address asset, uint256 collateralAmount, uint256 borrowAmount)
        external
        nonReentrant
        whenNotPaused
    {
        _addCollateral(msg.sender, asset, collateralAmount);
        if (borrowAmount > 0) _borrow(msg.sender, asset, borrowAmount);
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Asset must be Active. Credits the amount actually received by the vault (balance delta).
    function addCollateral(address asset, uint256 amount) external nonReentrant whenNotPaused {
        _addCollateral(msg.sender, asset, amount);
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Asset must be Active and the price valid. Enforces max LTV, borrow cap and pool liquidity.
    function borrow(address asset, uint256 amount) external nonReentrant whenNotPaused {
        _borrow(msg.sender, asset, amount);
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Works while paused and while the asset is paused. `amount` is clamped to the outstanding debt.
    function repay(address asset, uint256 amount) external nonReentrant {
        _repay(msg.sender, msg.sender, asset, amount);
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Same as `repay` but the caller pays for `user`.
    function repayOnBehalf(address user, address asset, uint256 amount) external nonReentrant {
        _repay(msg.sender, user, asset, amount);
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev If the position has debt the price must be valid and, after withdrawal, HF >= 1 and debt <= maxDebt.
    ///      Remaining collateral must be 0 or >= minDeposit. Allowed while the asset is Paused.
    function withdrawCollateral(address asset, uint256 amount, address to) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert InvalidParameters();
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        Position storage pos = _positions[msg.sender][asset];
        uint256 collateral = pos.collateral;
        if (amount > collateral) revert InsufficientCollateral();
        uint256 remaining = collateral - amount;
        if (remaining != 0 && remaining < cfg.minDeposit) revert BelowMinDeposit();

        uint256 debt = pos.debt;
        if (debt > 0) {
            (uint256 price, uint8 priceDecimals) = _requireValidPrice(cfg);
            uint256 remainingUsd = MosaicMath.toUsd(remaining, cfg.decimals, price, priceDecimals);
            if (MosaicMath.healthFactor(remainingUsd, cfg.liquidationThresholdBps, debt) < MosaicMath.WAD) {
                revert UnsafeWithdrawal();
            }
            if (debt > MosaicMath.maxDebt(remainingUsd, cfg.maxLtvBps)) revert UnsafeWithdrawal();
        }

        pos.collateral = remaining;
        pos.lastUpdated = uint64(block.timestamp);
        vault.withdrawCollateral(asset, msg.sender, to, amount);
        emit CollateralWithdrawn(msg.sender, asset, to, amount, remaining);
    }

    // ---------------------------------------------------------------------------------------------
    // Liquidation hook (LIQUIDATION_ENGINE_ROLE only)
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Eligibility and seize math are computed by the liquidation engine. The lending engine still refuses
    ///      to act on an invalid price (conservative oracle behaviour). Pulls `repayAmount` MUSD from the
    ///      liquidator into the pool, reduces debt and collateral, sends collateral to the liquidator, and
    ///      writes off any remaining debt when the collateral is exhausted.
    function liquidatePosition(address user, address asset, address liquidator, uint256 repayAmount, uint256 seizeAmount)
        external
        nonReentrant
        whenNotPaused
        onlyRole(LIQUIDATION_ENGINE_ROLE)
    {
        if (repayAmount == 0) revert ZeroAmount();
        if (liquidator == address(0)) revert InvalidParameters();
        _requireValidPrice(registry.getCollateralConfig(asset));

        Position storage pos = _positions[user][asset];
        if (pos.debt == 0) revert NoDebt();
        if (repayAmount > pos.debt) repayAmount = pos.debt;
        if (seizeAmount > pos.collateral) revert InsufficientCollateral();
        if (seizeAmount == pos.collateral && repayAmount < pos.debt) _requireShortfall(asset, pos);

        _pullMusd(liquidator, repayAmount);

        uint256 badDebt = _applyLiquidation(pos, repayAmount, seizeAmount);

        pool.receiveRepayment(asset, repayAmount);
        if (badDebt > 0) pool.writeOffBadDebt(asset, badDebt);
        if (seizeAmount > 0) vault.withdrawCollateral(asset, user, liquidator, seizeAmount);

        emit PositionLiquidated(user, asset, liquidator, repayAmount, seizeAmount, badDebt);
    }

    /// @dev A liquidation may leave debt with zero collateral only when the collateral was worth less than
    ///      the debt (a real shortfall). Otherwise the pool would write off debt the collateral covers.
    function _requireShortfall(address asset, Position storage pos) internal view {
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        (uint256 price, uint8 priceDecimals) = _requireValidPrice(cfg);
        uint256 collateralUsd = MosaicMath.toUsd(pos.collateral, cfg.decimals, price, priceDecimals);
        if (collateralUsd >= pos.debt) revert InvalidParameters();
    }

    /// @dev Updates the position; returns the bad debt written off (debt left with zero collateral).
    function _applyLiquidation(Position storage pos, uint256 repayAmount, uint256 seizeAmount)
        internal
        returns (uint256 badDebt)
    {
        uint256 newDebt = pos.debt - repayAmount;
        uint256 newCollateral = pos.collateral - seizeAmount;
        if (newCollateral == 0 && newDebt > 0) {
            badDebt = newDebt;
            newDebt = 0;
        }
        pos.debt = newDebt;
        pos.collateral = newCollateral;
        pos.lastUpdated = uint64(block.timestamp);
    }

    /// @dev Pulls exactly `amount` MUSD from `payer` into the pool (balance-delta checked).
    function _pullMusd(address payer, uint256 amount) internal {
        uint256 before = musd.balanceOf(address(pool));
        musd.safeTransferFrom(payer, address(pool), amount);
        if (musd.balanceOf(address(pool)) - before < amount) revert ZeroAmount();
    }

    // ---------------------------------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc IMosaicLendingEngine
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @inheritdoc IMosaicLendingEngine
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------------

    /// @inheritdoc IMosaicLendingEngine
    function getPosition(address user, address asset) external view returns (Position memory) {
        return _positions[user][asset];
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Never reverts. Unsupported assets return a zeroed view; an invalid price zeroes USD fields.
    function getPositionView(address user, address asset) public view returns (PositionView memory v) {
        Position memory pos = _positions[user][asset];
        v.collateral = pos.collateral;
        v.debt = pos.debt;
        v.healthFactor = pos.debt == 0 ? type(uint256).max : 0;

        if (!registry.isSupportedCollateral(asset)) return v;
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        v.liquidationPrice =
            MosaicMath.liquidationPrice(pos.debt, pos.collateral, cfg.decimals, cfg.liquidationThresholdBps);

        IPriceOracleAdapter.PriceData memory pd = _safePriceData(cfg.oracle, asset);
        v.priceUpdatedAt = pd.updatedAt;
        v.priceValid = pd.valid;
        if (!pd.valid) return v;

        v.price = _normalise18(pd.price, pd.decimals);
        v.collateralValueUsd = MosaicMath.toUsd(pos.collateral, cfg.decimals, pd.price, pd.decimals);
        v.maxDebtUsd = MosaicMath.maxDebt(v.collateralValueUsd, cfg.maxLtvBps);
        v.healthFactor = MosaicMath.healthFactor(v.collateralValueUsd, cfg.liquidationThresholdBps, pos.debt);
        v.currentLtvBps = MosaicMath.ltvBps(pos.debt, v.collateralValueUsd);

        if (cfg.status != AssetStatus.Active || paused()) return v;
        uint256 headroom = v.maxDebtUsd > pos.debt ? v.maxDebtUsd - pos.debt : 0;
        uint256 assetDebt = pool.getOutstandingDebt(asset);
        uint256 capRoom = cfg.borrowCap > assetDebt ? cfg.borrowCap - assetDebt : 0;
        uint256 liquidity = pool.getAvailableLiquidity();
        uint256 avail = headroom < liquidity ? headroom : liquidity;
        v.availableToBorrow = avail < capRoom ? avail : capRoom;
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Reverts `OraclePriceInvalid` when the position has debt and the price is invalid.
    function getHealthFactor(address user, address asset) external view returns (uint256) {
        Position memory pos = _positions[user][asset];
        if (pos.debt == 0) return type(uint256).max;
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        (uint256 price, uint8 priceDecimals) = _requireValidPrice(cfg);
        uint256 usd = MosaicMath.toUsd(pos.collateral, cfg.decimals, price, priceDecimals);
        return MosaicMath.healthFactor(usd, cfg.liquidationThresholdBps, pos.debt);
    }

    /// @inheritdoc IMosaicLendingEngine
    function getBorrowingCapacity(address user, address asset) external view returns (uint256) {
        return getPositionView(user, asset).availableToBorrow;
    }

    /// @inheritdoc IMosaicLendingEngine
    function getLiquidationPrice(address user, address asset) external view returns (uint256) {
        Position memory pos = _positions[user][asset];
        if (pos.debt == 0 || pos.collateral == 0) return 0;
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        return MosaicMath.liquidationPrice(pos.debt, pos.collateral, cfg.decimals, cfg.liquidationThresholdBps);
    }

    /// @inheritdoc IMosaicLendingEngine
    function getOutstandingDebt(address user, address asset) external view returns (uint256) {
        return _positions[user][asset].debt;
    }

    /// @inheritdoc IMosaicLendingEngine
    /// @dev Reverts `OraclePriceInvalid` if the price is invalid.
    function getCollateralValue(address user, address asset) external view returns (uint256) {
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        (uint256 price, uint8 priceDecimals) = _requireValidPrice(cfg);
        return MosaicMath.toUsd(_positions[user][asset].collateral, cfg.decimals, price, priceDecimals);
    }

    /// @inheritdoc IMosaicLendingEngine
    function getAssetDebt(address asset) external view returns (uint256) {
        return pool.getOutstandingDebt(asset);
    }

    // ---------------------------------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------------------------------

    function _addCollateral(address user, address asset, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        if (cfg.status != AssetStatus.Active) revert AssetNotActive(asset);

        IERC20 token = IERC20(asset);
        uint256 before = token.balanceOf(address(vault));
        token.safeTransferFrom(user, address(vault), amount);
        uint256 received = token.balanceOf(address(vault)) - before;
        if (received == 0) revert ZeroAmount();

        Position storage pos = _positions[user][asset];
        uint256 newCollateral = pos.collateral + received;
        if (newCollateral < cfg.minDeposit) revert BelowMinDeposit();
        if (vault.getTotalCollateral(asset) + received > cfg.maxExposure) revert ExceedsExposureCap();

        bool opened = pos.collateral == 0 && pos.debt == 0;
        pos.collateral = newCollateral;
        pos.lastUpdated = uint64(block.timestamp);
        vault.depositCollateral(asset, user, received);

        if (opened) emit PositionOpened(user, asset);
        emit CollateralAdded(user, asset, received, newCollateral);
    }

    function _borrow(address user, address asset, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        if (cfg.status != AssetStatus.Active) revert AssetNotActive(asset);
        (uint256 price, uint8 priceDecimals) = _requireValidPrice(cfg);

        Position storage pos = _positions[user][asset];
        uint256 collateralUsd = MosaicMath.toUsd(pos.collateral, cfg.decimals, price, priceDecimals);
        uint256 newDebt = pos.debt + amount;
        if (newDebt > MosaicMath.maxDebt(collateralUsd, cfg.maxLtvBps)) revert ExceedsMaxLtv();
        if (pool.getOutstandingDebt(asset) + amount > cfg.borrowCap) revert ExceedsBorrowCap();
        if (amount > pool.getAvailableLiquidity()) revert InsufficientPoolLiquidity();

        pos.debt = newDebt;
        pos.lastUpdated = uint64(block.timestamp);
        pool.lendToBorrower(asset, user, amount);
        emit Borrowed(user, asset, amount, newDebt);
    }

    function _repay(address payer, address user, address asset, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        // Any supported asset (Active or Paused) can be repaid; unsupported reverts AssetNotSupported.
        registry.getCollateralConfig(asset);
        Position storage pos = _positions[user][asset];
        uint256 debt = pos.debt;
        if (debt == 0) revert ZeroAmount();
        uint256 toRepay = amount > debt ? debt : amount;

        _pullMusd(payer, toRepay);

        uint256 newDebt = debt - toRepay;
        pos.debt = newDebt;
        pos.lastUpdated = uint64(block.timestamp);
        pool.receiveRepayment(asset, toRepay);
        emit Repaid(user, asset, payer, toRepay, newDebt);
    }

    /// @dev Reverts OraclePriceInvalid unless the oracle reports a valid price. Never lets a failure pass.
    function _requireValidPrice(CollateralConfig memory cfg) internal view returns (uint256, uint8) {
        IPriceOracleAdapter.PriceData memory pd = _safePriceData(cfg.oracle, cfg.token);
        if (!pd.valid || pd.price == 0) revert OraclePriceInvalid(cfg.token);
        return (pd.price, pd.decimals);
    }

    /// @dev Wraps the adapter call so a misbehaving oracle reads as "invalid" instead of reverting views.
    function _safePriceData(address oracle, address asset) internal view returns (IPriceOracleAdapter.PriceData memory pd) {
        if (oracle.code.length == 0) return pd;
        try IPriceOracleAdapter(oracle).getPriceData(asset) returns (IPriceOracleAdapter.PriceData memory out) {
            pd = out;
            if (pd.price == 0 || pd.decimals > 18) pd.valid = false;
        } catch {
            pd.valid = false;
        }
    }

    function _normalise18(uint256 price, uint8 decimals) internal pure returns (uint256) {
        if (decimals == 18) return price;
        if (decimals < 18) return price * 10 ** (18 - uint256(decimals));
        return price / 10 ** (uint256(decimals) - 18);
    }
}
