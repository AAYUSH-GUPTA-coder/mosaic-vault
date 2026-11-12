// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ICollateralVault} from "./interfaces/ICollateralVault.sol";

/// @title CollateralVault
/// @notice Holds collateral and keeps per-user/per-asset accounting. Only the engine (ENGINE_ROLE) moves balances.
///         Tokens arrive by the engine transferring them here; the vault does accounting and outbound transfers only.
contract CollateralVault is AccessControl, ReentrancyGuard, ICollateralVault {
    using SafeERC20 for IERC20;

    bytes32 public constant ENGINE_ROLE = keccak256("ENGINE_ROLE");

    error InvalidParameters();

    /// @dev user => asset => balance
    mapping(address => mapping(address => uint256)) private _balances;
    /// @dev asset => total accounted collateral
    mapping(address => uint256) private _totals;

    constructor(address admin) {
        if (admin == address(0)) revert InvalidParameters();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @inheritdoc ICollateralVault
    /// @dev Accounting only. Requires the vault to actually hold the tokens: balanceOf(this) >= total + amount.
    function depositCollateral(address asset, address user, uint256 amount) external onlyRole(ENGINE_ROLE) nonReentrant {
        if (IERC20(asset).balanceOf(address(this)) < _totals[asset] + amount) revert AccountingMismatch();
        _balances[user][asset] += amount;
        _totals[asset] += amount;
        emit CollateralDeposited(user, asset, amount);
    }

    /// @inheritdoc ICollateralVault
    function withdrawCollateral(address asset, address user, address to, uint256 amount)
        external
        onlyRole(ENGINE_ROLE)
        nonReentrant
    {
        uint256 bal = _balances[user][asset];
        if (amount > bal) revert InsufficientCollateral();
        _balances[user][asset] = bal - amount;
        _totals[asset] -= amount;
        IERC20(asset).safeTransfer(to, amount);
        emit CollateralWithdrawn(user, asset, to, amount);
    }

    /// @inheritdoc ICollateralVault
    function getCollateralBalance(address user, address asset) external view returns (uint256) {
        return _balances[user][asset];
    }

    /// @inheritdoc ICollateralVault
    function getTotalCollateral(address asset) external view returns (uint256) {
        return _totals[asset];
    }
}
