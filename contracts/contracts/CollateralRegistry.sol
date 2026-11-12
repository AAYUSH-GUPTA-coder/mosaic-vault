// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ICollateralRegistry} from "./interfaces/ICollateralRegistry.sol";
import {IPriceOracleAdapter} from "./interfaces/IPriceOracleAdapter.sol";

/// @title CollateralRegistry
/// @notice Per-asset risk configuration, oracle binding and status. Managed by RISK_MANAGER_ROLE.
contract CollateralRegistry is AccessControl, ICollateralRegistry {
    bytes32 public constant RISK_MANAGER_ROLE = keccak256("RISK_MANAGER_ROLE");
    uint16 public constant MAX_LIQUIDATION_THRESHOLD_BPS = 9_500;
    uint16 public constant MAX_LIQUIDATION_PENALTY_BPS = 3_000;

    mapping(address => CollateralConfig) private _configs;
    address[] private _assets;

    constructor(address admin) {
        if (admin == address(0)) revert InvalidParameters();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(RISK_MANAGER_ROLE, admin);
    }

    /// @inheritdoc ICollateralRegistry
    /// @dev Status becomes Active; decimals are read from the token; the oracle must report a valid price.
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
    ) external onlyRole(RISK_MANAGER_ROLE) {
        if (token == address(0) || oracle == address(0)) revert InvalidParameters();
        if (_configs[token].status != AssetStatus.None) revert AssetAlreadyRegistered(token);
        _validateRatios(maxLtvBps, liquidationThresholdBps, liquidationPenaltyBps);
        uint8 decimals = IERC20Metadata(token).decimals();
        if (decimals > 18) revert InvalidParameters();
        if (!IPriceOracleAdapter(oracle).isPriceValid(token)) revert OraclePriceInvalid(token);

        _configs[token] = CollateralConfig({
            token: token,
            oracle: oracle,
            decimals: decimals,
            maxLtvBps: maxLtvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            liquidationPenaltyBps: liquidationPenaltyBps,
            borrowCap: borrowCap,
            maxExposure: maxExposure,
            minDeposit: minDeposit,
            status: AssetStatus.Active,
            kind: kind,
            lastUpdated: uint64(block.timestamp)
        });
        _assets.push(token);

        emit CollateralAssetAdded(token, oracle, kind);
        emit CollateralParametersUpdated(
            token, maxLtvBps, liquidationThresholdBps, liquidationPenaltyBps, borrowCap, maxExposure, minDeposit
        );
    }

    /// @inheritdoc ICollateralRegistry
    function updateCollateralParameters(
        address token,
        uint16 maxLtvBps,
        uint16 liquidationThresholdBps,
        uint16 liquidationPenaltyBps,
        uint256 borrowCap,
        uint256 maxExposure,
        uint256 minDeposit
    ) external onlyRole(RISK_MANAGER_ROLE) {
        CollateralConfig storage c = _requireSupported(token);
        _validateRatios(maxLtvBps, liquidationThresholdBps, liquidationPenaltyBps);
        c.maxLtvBps = maxLtvBps;
        c.liquidationThresholdBps = liquidationThresholdBps;
        c.liquidationPenaltyBps = liquidationPenaltyBps;
        c.borrowCap = borrowCap;
        c.maxExposure = maxExposure;
        c.minDeposit = minDeposit;
        c.lastUpdated = uint64(block.timestamp);
        emit CollateralParametersUpdated(
            token, maxLtvBps, liquidationThresholdBps, liquidationPenaltyBps, borrowCap, maxExposure, minDeposit
        );
    }

    /// @inheritdoc ICollateralRegistry
    /// @dev The new oracle must report a valid price for the token.
    function setOracle(address token, address oracle) external onlyRole(RISK_MANAGER_ROLE) {
        CollateralConfig storage c = _requireSupported(token);
        if (oracle == address(0)) revert InvalidParameters();
        if (!IPriceOracleAdapter(oracle).isPriceValid(token)) revert OraclePriceInvalid(token);
        c.oracle = oracle;
        c.lastUpdated = uint64(block.timestamp);
        emit OracleUpdated(token, oracle);
    }

    /// @inheritdoc ICollateralRegistry
    function pauseCollateralAsset(address token) external onlyRole(RISK_MANAGER_ROLE) {
        CollateralConfig storage c = _requireSupported(token);
        c.status = AssetStatus.Paused;
        c.lastUpdated = uint64(block.timestamp);
        emit CollateralAssetPaused(token);
    }

    /// @inheritdoc ICollateralRegistry
    function unpauseCollateralAsset(address token) external onlyRole(RISK_MANAGER_ROLE) {
        CollateralConfig storage c = _requireSupported(token);
        c.status = AssetStatus.Active;
        c.lastUpdated = uint64(block.timestamp);
        emit CollateralAssetUnpaused(token);
    }

    /// @inheritdoc ICollateralRegistry
    function getCollateralConfig(address token) external view returns (CollateralConfig memory) {
        CollateralConfig memory c = _configs[token];
        if (c.status == AssetStatus.None) revert AssetNotSupported(token);
        return c;
    }

    /// @inheritdoc ICollateralRegistry
    function isSupportedCollateral(address token) external view returns (bool) {
        return _configs[token].status != AssetStatus.None;
    }

    /// @inheritdoc ICollateralRegistry
    function isActive(address token) external view returns (bool) {
        return _configs[token].status == AssetStatus.Active;
    }

    /// @inheritdoc ICollateralRegistry
    function listAssets() external view returns (address[] memory) {
        return _assets;
    }

    /// @inheritdoc ICollateralRegistry
    function assetCount() external view returns (uint256) {
        return _assets.length;
    }

    function _requireSupported(address token) internal view returns (CollateralConfig storage c) {
        c = _configs[token];
        if (c.status == AssetStatus.None) revert AssetNotSupported(token);
    }

    function _validateRatios(uint16 maxLtvBps, uint16 liqThresholdBps, uint16 penaltyBps) internal pure {
        if (maxLtvBps == 0 || maxLtvBps >= liqThresholdBps) revert InvalidParameters();
        if (liqThresholdBps > MAX_LIQUIDATION_THRESHOLD_BPS) revert InvalidParameters();
        if (penaltyBps > MAX_LIQUIDATION_PENALTY_BPS) revert InvalidParameters();
    }
}
