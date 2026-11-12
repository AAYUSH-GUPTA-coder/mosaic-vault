// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IMosaicLendingPool
interface IMosaicLendingPool {
    event LiquidityDeposited(address indexed provider, uint256 amount);
    event LiquidityWithdrawn(address indexed provider, address indexed to, uint256 amount);
    event Lent(address indexed asset, address indexed borrower, uint256 amount);
    event RepaymentReceived(address indexed asset, uint256 amount);
    event BadDebtWrittenOff(address indexed asset, uint256 amount);

    error InsufficientLiquidity();
    error ZeroAmount();
    error AccountingMismatch();

    function depositLiquidity(uint256 amount) external;
    function withdrawLiquidity(uint256 amount, address to) external;
    function lendToBorrower(address asset, address to, uint256 amount) external;
    function receiveRepayment(address asset, uint256 amount) external;
    function writeOffBadDebt(address asset, uint256 amount) external;
    function getAvailableLiquidity() external view returns (uint256);
    function getTotalOutstandingDebt() external view returns (uint256);
    function getOutstandingDebt(address asset) external view returns (uint256);
    function getTotalPoolAssets() external view returns (uint256);
    function totalBadDebt() external view returns (uint256);
    function musd() external view returns (address);
}
