// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IMosaicLendingPool} from "./interfaces/IMosaicLendingPool.sol";

/// @title MosaicLendingPool
/// @notice Holds MUSD supplied by liquidity providers. Only the engine (ENGINE_ROLE) lends and records repayments.
///         0% interest in the MVP.
contract MosaicLendingPool is AccessControl, ReentrancyGuard, IMosaicLendingPool {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");
    bytes32 public constant LIQUIDITY_PROVIDER_ROLE = keccak256("LIQUIDITY_PROVIDER_ROLE");

    error InvalidParameters();

    IERC20 private immutable _musd;

    mapping(address => uint256) private _outstandingDebt; // per collateral asset
    uint256 private _totalOutstandingDebt;
    uint256 private _totalBadDebt;

    constructor(address musd_, address admin) {
        if (musd_ == address(0) || admin == address(0)) revert InvalidParameters();
        _musd = IERC20(musd_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @inheritdoc IMosaicLendingPool
    /// @dev Pulls MUSD from msg.sender (approve the pool). Credits the amount actually received.
    function depositLiquidity(uint256 amount) external onlyRole(LIQUIDITY_PROVIDER_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 before = _musd.balanceOf(address(this));
        _musd.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = _musd.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();
        emit LiquidityDeposited(msg.sender, received);
    }

    /// @inheritdoc IMosaicLendingPool
    /// @dev Only idle liquidity can be withdrawn; lent-out funds are not available.
    function withdrawLiquidity(uint256 amount, address to) external onlyRole(LIQUIDITY_PROVIDER_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (to == address(0)) revert InvalidParameters();
        if (amount > _musd.balanceOf(address(this))) revert InsufficientLiquidity();
        _musd.safeTransfer(to, amount);
        emit LiquidityWithdrawn(msg.sender, to, amount);
    }

    /// @inheritdoc IMosaicLendingPool
    function lendToBorrower(address asset, address to, uint256 amount) external onlyRole(ENGINE_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > _musd.balanceOf(address(this))) revert InsufficientLiquidity();
        _outstandingDebt[asset] += amount;
        _totalOutstandingDebt += amount;
        _musd.safeTransfer(to, amount);
        emit Lent(asset, to, amount);
    }

    /// @inheritdoc IMosaicLendingPool
    /// @dev Accounting only; the engine has already transferred the MUSD here.
    function receiveRepayment(address asset, uint256 amount) external onlyRole(ENGINE_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > _outstandingDebt[asset]) revert AccountingMismatch();
        _outstandingDebt[asset] -= amount;
        _totalOutstandingDebt -= amount;
        emit RepaymentReceived(asset, amount);
    }

    /// @inheritdoc IMosaicLendingPool
    function writeOffBadDebt(address asset, uint256 amount) external onlyRole(ENGINE_ROLE) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > _outstandingDebt[asset]) revert AccountingMismatch();
        _outstandingDebt[asset] -= amount;
        _totalOutstandingDebt -= amount;
        _totalBadDebt += amount;
        emit BadDebtWrittenOff(asset, amount);
    }

    /// @inheritdoc IMosaicLendingPool
    function getAvailableLiquidity() public view returns (uint256) {
        return _musd.balanceOf(address(this));
    }

    /// @inheritdoc IMosaicLendingPool
    function getTotalOutstandingDebt() public view returns (uint256) {
        return _totalOutstandingDebt;
    }

    /// @inheritdoc IMosaicLendingPool
    function getOutstandingDebt(address asset) external view returns (uint256) {
        return _outstandingDebt[asset];
    }

    /// @inheritdoc IMosaicLendingPool
    function getTotalPoolAssets() external view returns (uint256) {
        return getAvailableLiquidity() + _totalOutstandingDebt;
    }

    /// @inheritdoc IMosaicLendingPool
    function totalBadDebt() external view returns (uint256) {
        return _totalBadDebt;
    }

    /// @inheritdoc IMosaicLendingPool
    function musd() external view returns (address) {
        return address(_musd);
    }
}
