// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMosaicTypes
/// @notice Shared enums and structs used across the Mosaic Vault contracts.
interface IMosaicTypes {
    /// @dev Paused: no new deposits/borrows; repay, withdraw and liquidate remain allowed.
    enum AssetStatus {
        None,
        Active,
        Paused
    }

    /// @dev UI labelling only.
    enum AssetKind {
        VerifiedExternal,
        TestOnly
    }

    struct CollateralConfig {
        address token;
        address oracle; // IPriceOracleAdapter
        uint8 decimals; // token decimals (<= 18)
        uint16 maxLtvBps; // 0 < maxLtv < liquidationThreshold
        uint16 liquidationThresholdBps; // <= 9_500
        uint16 liquidationPenaltyBps; // <= 3_000
        uint256 borrowCap; // max total debt (MUSD, 18 dec) against this asset
        uint256 maxExposure; // max total collateral deposited (token units)
        uint256 minDeposit; // minimum resulting collateral for a position (token units)
        AssetStatus status;
        AssetKind kind;
        uint64 lastUpdated; // block.timestamp of last config write
    }

    /// @dev Isolated per (user, asset).
    struct Position {
        uint256 collateral;
        uint256 debt;
        uint64 lastUpdated;
    }

    /// @dev Never reverts; priceValid=false => all USD fields are 0 and healthFactor = 0 (unless debt == 0).
    struct PositionView {
        uint256 collateral; // token units
        uint256 debt; // MUSD 18 dec
        uint256 collateralValueUsd; // 18 dec
        uint256 maxDebtUsd; // collateralValueUsd * maxLtv
        uint256 availableToBorrow; // min(maxDebt - debt, pool liquidity, borrowCap - assetDebt), 0 if paused/invalid
        uint256 healthFactor; // WAD; type(uint256).max when debt == 0
        uint256 liquidationPrice; // USD per whole token, 18 dec; 0 when debt == 0
        uint256 currentLtvBps; // debt / collateralValue in bps; 0 when no collateral
        uint256 price; // oracle price normalised to 18 dec
        uint256 priceUpdatedAt;
        bool priceValid;
    }
}
