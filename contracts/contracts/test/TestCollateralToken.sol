// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title TestCollateralToken
/// @notice TEST-ONLY collateral token. Has no value. Deployed on testnet.
/// @dev Minting is restricted to MINTER_ROLE (the deployer). A public faucet would let anyone mint free
///      collateral and borrow real MUSD from the pool (audit 2026-11-12, finding 4).
contract TestCollateralToken is ERC20, AccessControl {
    string public constant LABEL = "TEST-ONLY TOKEN: no value, minted by the Mosaic Vault team";
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 private immutable _decimals;
    uint256 public immutable maxFaucetPerCall;

    event Faucet(address indexed to, uint256 amount);

    error ExceedsFaucetCap(uint256 requested, uint256 cap);
    error ZeroAmount();

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 maxFaucetPerCall_)
        ERC20(name_, symbol_)
    {
        _decimals = decimals_;
        maxFaucetPerCall = maxFaucetPerCall_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mints `amount` to the caller (MINTER_ROLE only), capped at `maxFaucetPerCall` per call.
    function faucet(uint256 amount) external onlyRole(MINTER_ROLE) {
        _mintCapped(msg.sender, amount);
    }

    /// @notice Mints `amount` to `to` (MINTER_ROLE only), capped at `maxFaucetPerCall` per call.
    function mintTo(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mintCapped(to, amount);
    }

    function _mintCapped(address to, uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        if (amount > maxFaucetPerCall) revert ExceedsFaucetCap(amount, maxFaucetPerCall);
        _mint(to, amount);
        emit Faucet(to, amount);
    }
}
