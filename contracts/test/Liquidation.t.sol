// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";

contract LiquidationTest is BaseTest {
    function setUp() public override {
        super.setUp();
        _openWorkedExample(alice);
        musd.mint(liquidator, 100_000e18);
        _approveMusd(liquidator);
    }

    function test_eligibility_healthyNotLiquidatable() public {
        assertFalse(liq.isLiquidatable(alice, address(wbtc)));
        (uint256 d, uint256 c, uint256 p, bool ok) = liq.getLiquidationQuote(alice, address(wbtc), 1_000e18);
        assertFalse(ok);
        assertEq(d, 1_000e18);
        assertEq(c, 0.0108e8); // 1000 * 1.08 / 100,000 BTC
        assertEq(p, 100_000e18);
        vm.prank(liquidator);
        vm.expectRevert(MosaicLiquidationEngine.NotLiquidatable.selector);
        liq.liquidate(alice, address(wbtc), 1_000e18);
    }

    function test_eligibility_exactlyOneIsNotLiquidatable() public {
        // HF == 1 when collateral value == debt / 0.7 = $8,571.43 -> price $85,714.29 (rounded up keeps HF >= 1)
        oracle.setPrice(address(wbtc), 85_714.29e8, 8);
        assertGe(engine.getHealthFactor(alice, address(wbtc)), WAD);
        assertFalse(liq.isLiquidatable(alice, address(wbtc)));
        oracle.setPrice(address(wbtc), 85_714.28e8, 8);
        assertLt(engine.getHealthFactor(alice, address(wbtc)), WAD);
        assertTrue(liq.isLiquidatable(alice, address(wbtc)));
    }

    function test_eligibility_invalidOracleBlocksLiquidation() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        assertTrue(liq.isLiquidatable(alice, address(wbtc)));
        oracle.setInvalid(address(wbtc), true);
        assertFalse(liq.isLiquidatable(alice, address(wbtc)));
        (,,, bool ok) = liq.getLiquidationQuote(alice, address(wbtc), 1e18);
        assertFalse(ok);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(MosaicLiquidationEngine.OraclePriceInvalid.selector, address(wbtc)));
        liq.liquidate(alice, address(wbtc), 1e18);
        // stale price too
        oracle.setInvalid(address(wbtc), false);
        vm.warp(block.timestamp + 2 days);
        vm.prank(liquidator);
        vm.expectRevert(abi.encodeWithSelector(MosaicLiquidationEngine.OraclePriceInvalid.selector, address(wbtc)));
        liq.liquidate(alice, address(wbtc), 1e18);
    }

    function test_execution_fullLiquidationPenaltyMath() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8); // HF 0.9333
        // seizeUsd = 6000 * 1.08 = 6480 -> 6480 / 80000 = 0.081 BTC = 8_100_000
        (uint256 d, uint256 c, uint256 p, bool ok) = liq.getLiquidationQuote(alice, address(wbtc), 6_000e18);
        assertTrue(ok);
        assertEq(d, 6_000e18);
        assertEq(c, 0.081e8);
        assertEq(p, 80_000e18);

        uint256 liqMusdBefore = musd.balanceOf(liquidator);
        uint256 poolBefore = pool.getAvailableLiquidity();
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingEngine.PositionLiquidated(alice, address(wbtc), liquidator, 6_000e18, 0.081e8, 0);
        vm.expectEmit(true, true, true, true);
        emit MosaicLiquidationEngine.Liquidation(alice, address(wbtc), liquidator, 6_000e18, 0.081e8, 80_000e18);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 6_000e18);

        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pos.debt, 0);
        assertEq(pos.collateral, 0.1e8 - 0.081e8, "borrower keeps the remainder");
        assertEq(wbtc.balanceOf(liquidator), 0.081e8);
        assertEq(liqMusdBefore - musd.balanceOf(liquidator), 6_000e18);
        assertEq(pool.getAvailableLiquidity(), poolBefore + 6_000e18);
        assertEq(pool.getOutstandingDebt(address(wbtc)), 0);
        assertEq(pool.totalBadDebt(), 0);
        assertEq(vault.getCollateralBalance(alice, address(wbtc)), pos.collateral);
        _assertVaultSolvent(wbtc);
        _assertPoolConsistent();
    }

    function test_execution_partialLiquidationLeavesHealthierPosition() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 3_000e18);
        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pos.debt, 3_000e18);
        assertEq(pos.collateral, 0.1e8 - 0.0405e8); // 3240 / 80000 = 0.0405
        // HF = (0.0595 * 80000 * 0.7) / 3000 = 1.1107
        assertGt(engine.getHealthFactor(alice, address(wbtc)), WAD);
        assertFalse(liq.isLiquidatable(alice, address(wbtc)));
    }

    function test_execution_overRepayClampsToDebt() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        uint256 before = musd.balanceOf(liquidator);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), type(uint256).max);
        assertEq(before - musd.balanceOf(liquidator), 6_000e18);
        assertEq(_pos(alice, address(wbtc)).debt, 0);
    }

    function test_badDebt_writtenOffWhenCollateralExhausted() public {
        oracle.setPrice(address(wbtc), 50_000e8, 8); // collateral worth $5,000 vs $6,000 debt
        // repay 5000 -> seizeUsd 5400 -> 0.108 BTC > 0.1 => seize all; 1000 debt remains => written off
        (uint256 d, uint256 c,,) = liq.getLiquidationQuote(alice, address(wbtc), 5_000e18);
        assertEq(d, 5_000e18);
        assertEq(c, 0.1e8);
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingPool.BadDebtWrittenOff(address(wbtc), 1_000e18);
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingEngine.PositionLiquidated(alice, address(wbtc), liquidator, 5_000e18, 0.1e8, 1_000e18);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 5_000e18);
        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pos.debt, 0);
        assertEq(pos.collateral, 0);
        assertEq(pool.totalBadDebt(), 1_000e18);
        assertEq(pool.getOutstandingDebt(address(wbtc)), 0);
        assertEq(pool.getTotalOutstandingDebt(), 0);
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING - 1_000e18, "pool absorbed the loss");
        assertEq(wbtc.balanceOf(liquidator), 0.1e8);
        _assertPoolConsistent();
        _assertVaultSolvent(wbtc);
    }

    function test_doubleLiquidation_prevented() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        vm.startPrank(liquidator);
        liq.liquidate(alice, address(wbtc), 6_000e18);
        vm.expectRevert(MosaicLiquidationEngine.NotLiquidatable.selector);
        liq.liquidate(alice, address(wbtc), 6_000e18);
        vm.stopPrank();
        // and the engine hook itself refuses a position without debt
        vm.prank(address(liq));
        vm.expectRevert(IMosaicLendingEngine.NoDebt.selector);
        engine.liquidatePosition(alice, address(wbtc), liquidator, 1, 0);
    }

    function test_liquidation_requiresMusdApproval() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        vm.startPrank(liquidator);
        musd.approve(address(engine), 0);
        vm.expectRevert(); // ERC20InsufficientAllowance
        liq.liquidate(alice, address(wbtc), 6_000e18);
        vm.stopPrank();
        assertEq(_pos(alice, address(wbtc)).debt, 6_000e18, "nothing changed");
    }

    function test_liquidation_engineHookRefusesSeizingMoreThanCollateral() public {
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        vm.prank(address(liq));
        vm.expectRevert(IMosaicLendingEngine.InsufficientCollateral.selector);
        engine.liquidatePosition(alice, address(wbtc), liquidator, 1e18, 0.1e8 + 1);
    }

    function test_liquidation_sixDecimalCollateral() public {
        // usd6: 80% threshold, 5% penalty. bob deposits 10,000 tUSD, borrows 7,000; price -> $0.80
        _deposit(bob, usd6, 10_000e6);
        _borrow(bob, usd6, 7_000e18);
        oracle.setPrice(address(usd6), 0.8e8, 8); // value $8,000 -> HF = 6400/7000 = 0.914
        assertTrue(liq.isLiquidatable(bob, address(usd6)));
        // repay 7000 -> seizeUsd 7350 -> 7350/0.8 = 9187.5 tUSD
        (, uint256 c,,) = liq.getLiquidationQuote(bob, address(usd6), 7_000e18);
        assertEq(c, 9_187.5e6);
        vm.prank(liquidator);
        liq.liquidate(bob, address(usd6), 7_000e18);
        assertEq(usd6.balanceOf(liquidator), 9_187.5e6);
        assertEq(_pos(bob, address(usd6)).collateral, 812.5e6);
        assertEq(_pos(bob, address(usd6)).debt, 0);
    }
}
