// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";

contract RegistryTest is BaseTest {
    MockERC20 internal newTok;

    function setUp() public override {
        super.setUp();
        newTok = new MockERC20("New", "NEW", 8);
        oracle.setPrice(address(newTok), 5e8, 8);
    }

    function test_registerCollateral_setsConfigAndLists() public {
        uint256 before = registry.assetCount();
        vm.expectEmit(true, true, false, true);
        emit ICollateralRegistry.CollateralAssetAdded(address(newTok), address(oracle), AssetKind.TestOnly);
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1e18, 2e8, 3);
        CollateralConfig memory c = registry.getCollateralConfig(address(newTok));
        assertEq(c.token, address(newTok));
        assertEq(c.oracle, address(oracle));
        assertEq(c.decimals, 8);
        assertEq(c.maxLtvBps, 5_000);
        assertEq(c.liquidationThresholdBps, 6_000);
        assertEq(c.liquidationPenaltyBps, 1_000);
        assertEq(c.borrowCap, 1e18);
        assertEq(c.maxExposure, 2e8);
        assertEq(c.minDeposit, 3);
        assertEq(uint8(c.status), uint8(AssetStatus.Active));
        assertEq(uint8(c.kind), uint8(AssetKind.TestOnly));
        assertEq(c.lastUpdated, block.timestamp);
        assertEq(registry.assetCount(), before + 1);
        address[] memory list = registry.listAssets();
        assertEq(list[list.length - 1], address(newTok));
        assertTrue(registry.isSupportedCollateral(address(newTok)));
        assertTrue(registry.isActive(address(newTok)));
    }

    function test_registerCollateral_rejectsUnauthorized() public {
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, RISK_MANAGER_ROLE));
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1e18, 2e8, 3);
    }

    function test_registerCollateral_rejectsDuplicate() public {
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.AssetAlreadyRegistered.selector, address(wbtc)));
        registry.addCollateralAsset(address(wbtc), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1e18, 2e8, 3);
    }

    function test_registerCollateral_rejectsInvalidRatios() public {
        bytes memory err = abi.encodeWithSelector(ICollateralRegistry.InvalidParameters.selector);
        vm.expectRevert(err); // maxLtv == 0
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 0, 6_000, 1_000, 1, 1, 1);
        vm.expectRevert(err); // maxLtv >= threshold
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 6_000, 6_000, 1_000, 1, 1, 1);
        vm.expectRevert(err); // threshold > 9500
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 5_000, 9_600, 1_000, 1, 1, 1);
        vm.expectRevert(err); // penalty > 3000
        registry.addCollateralAsset(address(newTok), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 3_001, 1, 1, 1);
        vm.expectRevert(err); // zero token
        registry.addCollateralAsset(address(0), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1, 1, 1);
        vm.expectRevert(err); // zero oracle
        registry.addCollateralAsset(address(newTok), address(0), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1, 1, 1);
    }

    function test_registerCollateral_rejectsDecimalsAbove18() public {
        MockERC20 big = new MockERC20("Big", "BIG", 24);
        oracle.setPrice(address(big), 1e8, 8);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.InvalidParameters.selector));
        registry.addCollateralAsset(address(big), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1, 1, 1);
    }

    function test_registerCollateral_rejectsInvalidOraclePrice() public {
        MockERC20 unpriced = new MockERC20("U", "U", 18);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.OraclePriceInvalid.selector, address(unpriced)));
        registry.addCollateralAsset(address(unpriced), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1, 1, 1);
    }

    function test_updateParameters_appliesAndEmits() public {
        vm.expectEmit(true, false, false, true);
        emit ICollateralRegistry.CollateralParametersUpdated(address(wbtc), 5_000, 6_500, 900, 10e18, 20e8, 30);
        registry.updateCollateralParameters(address(wbtc), 5_000, 6_500, 900, 10e18, 20e8, 30);
        CollateralConfig memory c = registry.getCollateralConfig(address(wbtc));
        assertEq(c.maxLtvBps, 5_000);
        assertEq(c.liquidationThresholdBps, 6_500);
        assertEq(c.liquidationPenaltyBps, 900);
        assertEq(c.borrowCap, 10e18);
        assertEq(c.maxExposure, 20e8);
        assertEq(c.minDeposit, 30);
    }

    function test_updateParameters_rejectsUnauthorizedAndUnsupported() public {
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, RISK_MANAGER_ROLE));
        registry.updateCollateralParameters(address(wbtc), 5_000, 6_500, 900, 10e18, 20e8, 30);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.AssetNotSupported.selector, address(newTok)));
        registry.updateCollateralParameters(address(newTok), 5_000, 6_500, 900, 10e18, 20e8, 30);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.InvalidParameters.selector));
        registry.updateCollateralParameters(address(wbtc), 7_000, 6_500, 900, 10e18, 20e8, 30);
    }

    function test_pauseUnpause_changesStatus() public {
        vm.expectEmit(true, false, false, false);
        emit ICollateralRegistry.CollateralAssetPaused(address(wbtc));
        registry.pauseCollateralAsset(address(wbtc));
        assertFalse(registry.isActive(address(wbtc)));
        assertTrue(registry.isSupportedCollateral(address(wbtc)));
        assertEq(uint8(registry.getCollateralConfig(address(wbtc)).status), uint8(AssetStatus.Paused));
        registry.unpauseCollateralAsset(address(wbtc));
        assertTrue(registry.isActive(address(wbtc)));
    }

    function test_pause_rejectsUnauthorized() public {
        vm.startPrank(stranger);
        vm.expectRevert(_unauthorized(stranger, RISK_MANAGER_ROLE));
        registry.pauseCollateralAsset(address(wbtc));
        vm.expectRevert(_unauthorized(stranger, RISK_MANAGER_ROLE));
        registry.unpauseCollateralAsset(address(wbtc));
        vm.stopPrank();
    }

    function test_setOracle_requiresValidPrice() public {
        TestPriceOracle other = new TestPriceOracle(admin);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.OraclePriceInvalid.selector, address(wbtc)));
        registry.setOracle(address(wbtc), address(other));
        other.setPrice(address(wbtc), 1e8, 8);
        vm.expectEmit(true, true, false, false);
        emit ICollateralRegistry.OracleUpdated(address(wbtc), address(other));
        registry.setOracle(address(wbtc), address(other));
        assertEq(registry.getCollateralConfig(address(wbtc)).oracle, address(other));
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, RISK_MANAGER_ROLE));
        registry.setOracle(address(wbtc), address(other));
    }

    function test_getConfig_revertsForUnsupported() public {
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.AssetNotSupported.selector, address(newTok)));
        registry.getCollateralConfig(address(newTok));
        assertFalse(registry.isSupportedCollateral(address(newTok)));
        assertFalse(registry.isActive(address(newTok)));
    }
}
