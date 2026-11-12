// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMosaicTypes} from "./IMosaicTypes.sol";

/// @title IMosaicLendingEngine
interface IMosaicLendingEngine is IMosaicTypes {
    event PositionOpened(address indexed user, address indexed asset);
    event CollateralAdded(address indexed user, address indexed asset, uint256 amount, uint256 newCollateral);
    event CollateralWithdrawn(
        address indexed user, address indexed asset, address indexed to, uint256 amount, uint256 newCollateral
    );
    event Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 newDebt);
    event Repaid(address indexed user, address indexed asset, address indexed payer, uint256 amount, uint256 newDebt);
    event PositionLiquidated(
        address indexed user,
        address indexed asset,
        address indexed liquidator,
        uint256 debtRepaid,
        uint256 collateralSeized,
        uint256 badDebt
    );

    error AssetNotActive(address asset);
    error OraclePriceInvalid(address asset);
    error ExceedsMaxLtv();
    error ExceedsBorrowCap();
    error ExceedsExposureCap();
    error InsufficientPoolLiquidity();
    error BelowMinDeposit();
    error UnsafeWithdrawal();
    error InsufficientCollateral();
    error ZeroAmount();
    error NoDebt();

    function openPosition(address asset, uint256 collateralAmount, uint256 borrowAmount) external;
    function addCollateral(address asset, uint256 amount) external;
    function borrow(address asset, uint256 amount) external;
    function repay(address asset, uint256 amount) external;
    function repayOnBehalf(address user, address asset, uint256 amount) external;
    function withdrawCollateral(address asset, uint256 amount, address to) external;
    function getPosition(address user, address asset) external view returns (Position memory);
    function getPositionView(address user, address asset) external view returns (PositionView memory);
    function getHealthFactor(address user, address asset) external view returns (uint256);
    function getBorrowingCapacity(address user, address asset) external view returns (uint256);
    function getLiquidationPrice(address user, address asset) external view returns (uint256);
    function getOutstandingDebt(address user, address asset) external view returns (uint256);
    function getCollateralValue(address user, address asset) external view returns (uint256);
    function getAssetDebt(address asset) external view returns (uint256);
    function liquidatePosition(address user, address asset, address liquidator, uint256 repayAmount, uint256 seizeAmount)
        external;
    function pause() external;
    function unpause() external;
}
