// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title MosaicMath
/// @notice Fixed-point helpers. USD values are 18-dec, ratios are basis points, health factor is WAD.
library MosaicMath {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    /// @dev amount (tokenDecimals) * price (priceDecimals) -> USD (18 dec)
    function toUsd(uint256 amount, uint8 tokenDecimals, uint256 price, uint8 priceDecimals)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(amount * WAD, price, 10 ** (uint256(tokenDecimals) + uint256(priceDecimals)));
    }

    /// @dev USD (18 dec) -> amount (tokenDecimals) at price (priceDecimals)
    function fromUsd(uint256 usd, uint8 tokenDecimals, uint256 price, uint8 priceDecimals)
        internal
        pure
        returns (uint256)
    {
        return Math.mulDiv(usd, 10 ** (uint256(tokenDecimals) + uint256(priceDecimals)), price * WAD);
    }

    function maxDebt(uint256 collateralUsd, uint16 maxLtvBps) internal pure returns (uint256) {
        return collateralUsd * maxLtvBps / BPS;
    }

    function healthFactor(uint256 collateralUsd, uint16 liqThresholdBps, uint256 debt)
        internal
        pure
        returns (uint256)
    {
        if (debt == 0) return type(uint256).max;
        return Math.mulDiv(collateralUsd * liqThresholdBps, WAD, debt * BPS);
    }

    /// @dev 18-dec USD per whole token at which HF == 1.
    function liquidationPrice(uint256 debt, uint256 collateral, uint8 tokenDecimals, uint16 liqThresholdBps)
        internal
        pure
        returns (uint256)
    {
        if (collateral == 0 || debt == 0) return 0;
        return Math.mulDiv(debt * BPS, 10 ** uint256(tokenDecimals), collateral * liqThresholdBps);
    }

    function ltvBps(uint256 debt, uint256 collateralUsd) internal pure returns (uint256) {
        if (collateralUsd == 0) return 0;
        return debt * BPS / collateralUsd;
    }
}
