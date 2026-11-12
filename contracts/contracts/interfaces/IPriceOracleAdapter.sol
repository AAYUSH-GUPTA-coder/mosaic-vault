// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IPriceOracleAdapter
/// @notice Uniform price interface consumed by the registry, engine and liquidation engine.
interface IPriceOracleAdapter {
    struct PriceData {
        uint256 price;
        uint8 decimals;
        uint256 updatedAt;
        bool valid;
    }

    error OraclePriceInvalid(address asset);

    /// @notice Returns the raw price and its timestamp. Reverts `OraclePriceInvalid(asset)` when the price is not valid.
    function getPrice(address asset) external view returns (uint256 price, uint256 updatedAt);

    /// @notice Decimals of the raw price returned by `getPrice`.
    function getPriceDecimals(address asset) external view returns (uint8);

    /// @notice True iff price > 0, updatedAt > 0, not stale and the underlying feed did not revert. Never reverts.
    function isPriceValid(address asset) external view returns (bool);

    /// @notice Full price data. Never reverts.
    function getPriceData(address asset) external view returns (PriceData memory);
}
