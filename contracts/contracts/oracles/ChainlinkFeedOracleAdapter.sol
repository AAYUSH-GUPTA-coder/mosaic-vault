// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IPriceOracleAdapter} from "../interfaces/IPriceOracleAdapter.sol";

/// @dev Minimal Chainlink-style aggregator surface (the Mezo BTC/USD precompile implements it).
interface IAggregatorV3 {
    function decimals() external view returns (uint8);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @title ChainlinkFeedOracleAdapter
/// @notice Adapter over AggregatorV3-style feeds (verified external assets). Conservative: any feed failure,
///         non-positive answer or stale timestamp makes the price invalid. `answeredInRound` is NOT checked
///         because the Mezo precompile returns 0.
contract ChainlinkFeedOracleAdapter is AccessControl, IPriceOracleAdapter {
    bytes32 public constant ORACLE_MANAGER_ROLE = keccak256("ORACLE_MANAGER_ROLE");
    uint256 public constant MIN_STALENESS = 30;
    uint256 public constant MAX_STALENESS = 86_400;

    struct Feed {
        address aggregator;
        uint8 decimals;
        uint256 maxStaleness;
    }

    /// @notice asset => feed config
    mapping(address => Feed) public feeds;

    event FeedSet(address indexed asset, address indexed aggregator, uint8 decimals, uint256 maxStaleness);
    event FeedRemoved(address indexed asset);

    error InvalidParameters();

    constructor(address admin) {
        if (admin == address(0)) revert InvalidParameters();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ORACLE_MANAGER_ROLE, admin);
    }

    /// @notice Binds `asset` to `aggregator`. Reads and caches the aggregator decimals.
    /// @param asset Collateral token address.
    /// @param aggregator AggregatorV3-style feed.
    /// @param maxStaleness Max age of the answer in seconds, in [30, 86_400].
    function setFeed(address asset, address aggregator, uint256 maxStaleness) external onlyRole(ORACLE_MANAGER_ROLE) {
        if (asset == address(0) || aggregator == address(0) || aggregator.code.length == 0) revert InvalidParameters();
        if (maxStaleness < MIN_STALENESS || maxStaleness > MAX_STALENESS) revert InvalidParameters();
        uint8 dec = IAggregatorV3(aggregator).decimals();
        feeds[asset] = Feed({aggregator: aggregator, decimals: dec, maxStaleness: maxStaleness});
        emit FeedSet(asset, aggregator, dec, maxStaleness);
    }

    /// @notice Removes the feed for `asset`; the price becomes invalid.
    function removeFeed(address asset) external onlyRole(ORACLE_MANAGER_ROLE) {
        delete feeds[asset];
        emit FeedRemoved(asset);
    }

    /// @inheritdoc IPriceOracleAdapter
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt) {
        PriceData memory d = _read(asset);
        if (!d.valid) revert OraclePriceInvalid(asset);
        return (d.price, d.updatedAt);
    }

    /// @inheritdoc IPriceOracleAdapter
    function getPriceDecimals(address asset) external view returns (uint8) {
        return feeds[asset].decimals;
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
        Feed memory f = feeds[asset];
        d.decimals = f.decimals;
        if (f.aggregator == address(0) || f.aggregator.code.length == 0) return d;
        try IAggregatorV3(f.aggregator).latestRoundData() returns (uint80, int256 answer, uint256, uint256 updatedAt, uint80)
        {
            if (answer <= 0 || updatedAt == 0 || updatedAt > block.timestamp) return d;
            if (block.timestamp - updatedAt > f.maxStaleness) {
                d.price = uint256(answer);
                d.updatedAt = updatedAt;
                return d; // stale: valid stays false
            }
            d.price = uint256(answer);
            d.updatedAt = updatedAt;
            d.valid = true;
        } catch {
            return d;
        }
    }
}
