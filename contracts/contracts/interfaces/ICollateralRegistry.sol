// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IMosaicTypes} from "./IMosaicTypes.sol";

/// @title ICollateralRegistry
interface ICollateralRegistry is IMosaicTypes {
    event CollateralAssetAdded(address indexed token, address indexed oracle, AssetKind kind);
    event CollateralParametersUpdated(
        address indexed token,
        uint16 maxLtvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationPenaltyBps,
        uint256 borrowCap,
        uint256 maxExposure,
        uint256 minDeposit
    );
    event OracleUpdated(address indexed token, address indexed oracle);
    event CollateralAssetPaused(address indexed token);
    event CollateralAssetUnpaused(address indexed token);

    error AssetAlreadyRegistered(address token);
    error AssetNotSupported(address token);
    error InvalidParameters();
    error OraclePriceInvalid(address asset);

    function addCollateralAsset(
        address token,
        address oracle,
        AssetKind kind,
        uint16 maxLtvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationPenaltyBps,
        uint256 borrowCap,
        uint256 maxExposure,
        uint256 minDeposit
    ) external;

    function updateCollateralParameters(
        address token,
        uint16 maxLtvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationPenaltyBps,
        uint256 borrowCap,
        uint256 maxExposure,
        uint256 minDeposit
    ) external;

    function setOracle(address token, address oracle) external;
    function pauseCollateralAsset(address token) external;
    function unpauseCollateralAsset(address token) external;
    function getCollateralConfig(address token) external view returns (CollateralConfig memory);
    function isSupportedCollateral(address token) external view returns (bool);
    function isActive(address token) external view returns (bool);
    function listAssets() external view returns (address[] memory);
    function assetCount() external view returns (uint256);
}
