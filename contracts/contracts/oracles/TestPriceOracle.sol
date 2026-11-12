// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPriceOracleAdapter} from "../interfaces/IPriceOracleAdapter.sol";

/// @title TestPriceOracle
/// @notice TEST-ONLY oracle with admin-set prices. Used for test-only collateral (tWBTC, tUSD) and demos.
contract TestPriceOracle is AccessControl, IPriceOracleAdapter {
    bytes32 public constant ORACLE_MANAGER_ROLE = keccak256("ORACLE_MANAGER_ROLE");
    string public constant LABEL = "TEST-ONLY ORACLE: admin-set prices, not market data";
    uint256 public constant DEFAULT_MAX_STALENESS = 1 days;

    struct Entry {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
    }

    mapping(address => Entry) private _entries;
    mapping(address => uint256) private _maxStaleness; // 0 => default
    mapping(address => bool) public invalidOverride;

    event PriceSet(address indexed asset, uint256 price, uint8 decimals, uint256 updatedAt);
    event ValidityOverridden(address indexed asset, bool invalid);
    event MaxStalenessSet(address indexed asset, uint256 maxStaleness);

    error InvalidParameters();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidParameters();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_MANAGER_ROLE, admin);
    }

    /// @notice Sets the price for `asset`; `updatedAt` = block.timestamp.
    function setPrice(address asset, uint256 price, uint8 decimals) external onlyRole(ORACLE_MANAGER_ROLE) {
        if (asset == address(0) || decimals > 18) revert InvalidParameters();
        _entries[asset] = Entry({price: price, decimals: decimals, updatedAt: block.timestamp});
        emit PriceSet(asset, price, decimals, block.timestamp);
    }

    /// @notice Sets the max staleness (seconds) for `asset`. Default is 1 day.
    function setMaxStaleness(address asset, uint256 maxStaleness_) external onlyRole(ORACLE_MANAGER_ROLE) {
        if (maxStaleness_ == 0) revert InvalidParameters();
        _maxStaleness[asset] = maxStaleness_;
        emit MaxStalenessSet(asset, maxStaleness_);
    }

    /// @notice Forces `valid=false` for `asset` (failure demos).
    function setInvalid(address asset, bool invalid) external onlyRole(ORACLE_MANAGER_ROLE) {
        invalidOverride[asset] = invalid;
        emit ValidityOverridden(asset, invalid);
    }

    /// @notice Effective max staleness for `asset`.
    function maxStaleness(address asset) public view returns (uint256) {
        uint256 s = _maxStaleness[asset];
        return s == 0 ? DEFAULT_MAX_STALENESS : s;
    }

    /// @inheritdoc IPriceOracleAdapter
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory d = _read(asset);
        if (!d.valid) revert OraclePriceInvalid(asset);
        return (d.price, d.updatedAt);
    }

    /// @inheritdoc IPriceOracleAdapter
    function getPriceDecimals(address asset) external view returns (uint8) {
        return _entries[asset].decimals;
    }

    /// @inheritdoc IPriceOracleAdapter
    function isPriceValid(address asset) external view returns (bool) {
        return _read(asset).valid;
    }

    /// @inheritdoc IPriceOracleAdapter
    function getPriceData(address asset) external view returns (PriceData memory) {
        return _read(asset);
    }

    function _read(address asset) internal view returns (PriceData memory d) {
        Entry memory e = _entries[asset];
        d.price = e.price;
        d.decimals = e.decimals;
        d.updatedAt = e.updatedAt;
        if (invalidOverride[asset]) return d;
        if (e.price == 0 || e.updatedAt == 0 || e.updatedAt > block.timestamp) return d;
        if (block.timestamp - e.updatedAt > maxStaleness(asset)) return d;
        d.valid = true;
    }
}
