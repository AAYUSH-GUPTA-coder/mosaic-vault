// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IMosaicLendingEngine} from "./interfaces/IMosaicLendingEngine.sol";
import {ICollateralRegistry} from "./interfaces/ICollateralRegistry.sol";
import {IPriceOracleAdapter} from "./interfaces/IPriceOracleAdapter.sol";
import {IMosaicTypes} from "./interfaces/IMosaicTypes.sol";
import {MosaicMath} from "./libraries/MosaicMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MosaicLiquidationEngine
/// @notice Permissionless liquidation of positions whose health factor is below 1. The liquidator approves the
///         lending engine for MUSD; the lending engine pulls the repayment and releases the seized collateral.
contract MosaicLiquidationEngine is ReentrancyGuard, IMosaicTypes {
    IMosaicLendingEngine public immutable engine;
    ICollateralRegistry public immutable registry;
    address public immutable musd;

    event Liquidation(
        address indexed user,
        address indexed asset,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 price
    );

    error NotLiquidatable();
    error OraclePriceInvalid(address asset);
    error InvalidParameters();

    constructor(address engine_, address registry_, address musd_) {
        if (engine_ == address(0) || registry_ == address(0) || musd_ == address(0)) revert InvalidParameters();
        engine = IMosaicLendingEngine(engine_);
        registry = ICollateralRegistry(registry_);
        musd = musd_;
    }

    /// @notice True iff the position has debt, the price is valid and HF < 1e18. Never reverts.
    function isLiquidatable(address user, address asset) public view returns (bool) {
        PositionView memory v = engine.getPositionView(user, asset);
        if (!v.priceValid || v.debt == 0) return false;
        return v.healthFactor < MosaicMath.WAD;
    }

    /// @notice Quote for liquidating `user`'s `asset` position by repaying up to `repayAmount` MUSD.
    /// @return debtToRepay min(repayAmount, debt)
    /// @return collateralToSeize min(fromUsd(debtToRepay * (1 + penalty)), collateral)
    /// @return price oracle price normalised to 18 decimals (0 if invalid)
    /// @return liquidatable whether the position is currently liquidatable
    function getLiquidationQuote(address user, address asset, uint256 repayAmount)
        external
        view
        returns (uint256 debtToRepay, uint256 collateralToSeize, uint256 price, bool liquidatable)
    {
        PositionView memory v = engine.getPositionView(user, asset);
        liquidatable = v.priceValid && v.debt > 0 && v.healthFactor < MosaicMath.WAD;
        price = v.price;
        if (!v.priceValid || v.debt == 0) return (0, 0, price, false);
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        IPriceOracleAdapter.PriceData memory pd = IPriceOracleAdapter(cfg.oracle).getPriceData(asset);
        (debtToRepay, collateralToSeize) = _quote(v, cfg, pd, repayAmount);
    }

    /// @notice Liquidates `user`'s `asset` position. Caller must have approved the lending engine for MUSD.
    function liquidate(address user, address asset, uint256 repayAmount) external nonReentrant {
        PositionView memory v = engine.getPositionView(user, asset);
        if (!v.priceValid) revert OraclePriceInvalid(asset);
        if (v.debt == 0 || v.healthFactor >= MosaicMath.WAD) revert NotLiquidatable();
        CollateralConfig memory cfg = registry.getCollateralConfig(asset);
        IPriceOracleAdapter.PriceData memory pd = IPriceOracleAdapter(cfg.oracle).getPriceData(asset);
        if (!pd.valid) revert OraclePriceInvalid(asset);
        (uint256 debtToRepay, uint256 collateralToSeize) = _quote(v, cfg, pd, repayAmount);
        engine.liquidatePosition(user, asset, msg.sender, debtToRepay, collateralToSeize);
        emit Liquidation(user, asset, msg.sender, debtToRepay, collateralToSeize, v.price);
    }

    function _quote(
        PositionView memory v,
        CollateralConfig memory cfg,
        IPriceOracleAdapter.PriceData memory pd,
        uint256 repayAmount
    ) internal pure returns (uint256 debtToRepay, uint256 collateralToSeize) {
        debtToRepay = repayAmount > v.debt ? v.debt : repayAmount;
        uint256 bonusBps = MosaicMath.BPS + cfg.liquidationPenaltyBps;
        // Solvent position (collateral covers debt): the bonus may only come from the borrower's own
        // equity. When the full penalty would exceed it, seize the repaid share of the collateral
        // instead. The remaining position keeps its collateral ratio (>= 1), so a partial repay can
        // never empty the collateral and push covered debt onto the pool (audit 2026-11-12, findings 1-3, 7).
        if (v.collateralValueUsd >= v.debt && v.collateralValueUsd * MosaicMath.BPS < v.debt * bonusBps) {
            collateralToSeize = Math.mulDiv(v.collateral, debtToRepay, v.debt);
            return (debtToRepay, collateralToSeize);
        }
        uint256 seizeUsd = debtToRepay * bonusBps / MosaicMath.BPS;
        collateralToSeize = MosaicMath.fromUsd(seizeUsd, cfg.decimals, pd.price, pd.decimals);
        if (collateralToSeize > v.collateral) collateralToSeize = v.collateral;
    }
}
