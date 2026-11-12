// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ICollateralVault
interface ICollateralVault {
    event CollateralDeposited(address indexed user, address indexed asset, uint256 amount);
    event CollateralWithdrawn(address indexed user, address indexed asset, address indexed to, uint256 amount);

    error InsufficientCollateral();
    error AccountingMismatch();

    function depositCollateral(address asset, address user, uint256 amount) external;
    function withdrawCollateral(address asset, address user, address to, uint256 amount) external;
    function getCollateralBalance(address user, address asset) external view returns (uint256);
    function getTotalCollateral(address asset) external view returns (uint256);
}
