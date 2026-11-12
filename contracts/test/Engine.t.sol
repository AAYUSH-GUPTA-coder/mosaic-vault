// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";

contract EngineTest is BaseTest {
    // ------------------------------------------------------------------ deposit

    function test_deposit_creditsPositionAndVault() public {
        _mintAndApprove(wbtc, alice, 1e8);
        vm.expectEmit(true, true, false, false);
        emit IMosaicLendingEngine.PositionOpened(alice, address(wbtc));
        vm.expectEmit(true, true, false, true);
        emit IMosaicLendingEngine.CollateralAdded(alice, address(wbtc), 1e8, 1e8);
        vm.prank(alice);
        engine.addCollateral(address(wbtc), 1e8);
        assertEq(_pos(alice, address(wbtc)).collateral, 1e8);
        assertEq(vault.getCollateralBalance(alice, address(wbtc)), 1e8);
        assertEq(vault.getTotalCollateral(address(wbtc)), 1e8);
        assertEq(wbtc.balanceOf(address(vault)), 1e8);
        assertEq(wbtc.balanceOf(address(engine)), 0, "engine must not hold collateral");
        _assertVaultSolvent(wbtc);
    }

    function test_deposit_secondDepositDoesNotReopen() public {
        _deposit(alice, wbtc, 1e8);
        _mintAndApprove(wbtc, alice, 1e8);
        vm.recordLogs();
        vm.prank(alice);
        engine.addCollateral(address(wbtc), 1e8);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; i++) {
            assertTrue(logs[i].topics[0] != IMosaicLendingEngine.PositionOpened.selector, "re-opened");
        }
        assertEq(_pos(alice, address(wbtc)).collateral, 2e8);
    }

    function test_deposit_rejectsZeroBelowMinUnsupportedAndInactive() public {
        _mintAndApprove(wbtc, alice, 1e8);
        vm.startPrank(alice);
        vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector);
        engine.addCollateral(address(wbtc), 0);
        vm.expectRevert(IMosaicLendingEngine.BelowMinDeposit.selector);
        engine.addCollateral(address(wbtc), 1e4 - 1);
        MockERC20 unknown = new MockERC20("X", "X", 18);
        vm.expectRevert(abi.encodeWithSelector(ICollateralRegistry.AssetNotSupported.selector, address(unknown)));
        engine.addCollateral(address(unknown), 1);
        vm.stopPrank();
        registry.pauseCollateralAsset(address(wbtc));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.AssetNotActive.selector, address(wbtc)));
        engine.addCollateral(address(wbtc), 1e8);
    }

    function test_deposit_worksWithInvalidOracle() public {
        oracle.setInvalid(address(wbtc), true);
        _deposit(alice, wbtc, 1e8);
        assertEq(_pos(alice, address(wbtc)).collateral, 1e8);
    }

    function test_deposit_exposureCap() public {
        registry.updateCollateralParameters(address(wbtc), 6_000, 7_000, 800, 1_000_000e18, 1e8, 1e4);
        _deposit(alice, wbtc, 0.6e8);
        _mintAndApprove(wbtc, bob, 1e8);
        vm.prank(bob);
        vm.expectRevert(IMosaicLendingEngine.ExceedsExposureCap.selector);
        engine.addCollateral(address(wbtc), 0.4e8 + 1);
        vm.prank(bob);
        engine.addCollateral(address(wbtc), 0.4e8);
        assertEq(vault.getTotalCollateral(address(wbtc)), 1e8);
    }

    function test_openPosition_depositsThenBorrows() public {
        _mintAndApprove(wbtc, alice, 1e8);
        vm.prank(alice);
        engine.openPosition(address(wbtc), 1e8, 50_000e18);
        Position memory p = _pos(alice, address(wbtc));
        assertEq(p.collateral, 1e8);
        assertEq(p.debt, 50_000e18);
        assertEq(musd.balanceOf(alice), 50_000e18);
        _assertPoolConsistent();
    }

    function test_openPosition_zeroBorrowOnlyDeposits() public {
        _mintAndApprove(wbtc, alice, 1e8);
        vm.prank(alice);
        engine.openPosition(address(wbtc), 1e8, 0);
        assertEq(_pos(alice, address(wbtc)).debt, 0);
    }

    // ------------------------------------------------------------------ borrow

    function test_borrow_withinLimitsEmitsAndLends() public {
        _deposit(alice, wbtc, 1e8); // $100k, maxDebt $60k
        vm.expectEmit(true, true, false, true);
        emit IMosaicLendingEngine.Borrowed(alice, address(wbtc), 60_000e18, 60_000e18);
        _borrow(alice, wbtc, 60_000e18);
        assertEq(musd.balanceOf(alice), 60_000e18);
        assertEq(pool.getOutstandingDebt(address(wbtc)), 60_000e18);
        assertEq(engine.getAssetDebt(address(wbtc)), 60_000e18);
        assertEq(pool.getAvailableLiquidity(), POOL_FUNDING - 60_000e18);
        _assertPoolConsistent();
    }

    function test_borrow_aboveMaxLtvRejected() public {
        _deposit(alice, wbtc, 1e8);
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.ExceedsMaxLtv.selector);
        engine.borrow(address(wbtc), 60_000e18 + 1);
        _borrow(alice, wbtc, 30_000e18);
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.ExceedsMaxLtv.selector);
        engine.borrow(address(wbtc), 30_000e18 + 1);
    }

    function test_borrow_insufficientPoolLiquidity() public {
        vm.prank(lp);
        pool.withdrawLiquidity(POOL_FUNDING - 1_000e18, lp);
        _deposit(alice, wbtc, 1e8);
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.InsufficientPoolLiquidity.selector);
        engine.borrow(address(wbtc), 1_000e18 + 1);
        _borrow(alice, wbtc, 1_000e18);
        assertEq(pool.getAvailableLiquidity(), 0);
    }

    function test_borrow_capEnforcedAcrossUsers() public {
        registry.updateCollateralParameters(address(wbtc), 6_000, 7_000, 800, 50_000e18, 100e8, 1e4);
        _deposit(alice, wbtc, 1e8);
        _deposit(bob, wbtc, 1e8);
        _borrow(alice, wbtc, 30_000e18);
        vm.prank(bob);
        vm.expectRevert(IMosaicLendingEngine.ExceedsBorrowCap.selector);
        engine.borrow(address(wbtc), 20_000e18 + 1);
        _borrow(bob, wbtc, 20_000e18);
        // the cap is per asset: usd6 still borrowable
        _deposit(bob, usd6, 10_000e6);
        _borrow(bob, usd6, 1_000e18);
    }

    function test_borrow_zeroNoCollateralAndInactive() public {
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector);
        engine.borrow(address(wbtc), 0);
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.ExceedsMaxLtv.selector);
        engine.borrow(address(wbtc), 1);
        _deposit(alice, wbtc, 1e8);
        registry.pauseCollateralAsset(address(wbtc));
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.AssetNotActive.selector, address(wbtc)));
        engine.borrow(address(wbtc), 1e18);
    }

    function test_borrow_staleOracleRejected() public {
        _deposit(alice, wbtc, 1e8);
        vm.warp(block.timestamp + 1 days + 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.OraclePriceInvalid.selector, address(wbtc)));
        engine.borrow(address(wbtc), 1e18);
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 0, "capacity must be 0 on invalid price");
    }

    function test_borrow_invalidOracleNeverIncreasesCapacity() public {
        _deposit(alice, wbtc, 1e8);
        uint256 capBefore = engine.getBorrowingCapacity(alice, address(wbtc));
        assertEq(capBefore, 60_000e18);
        oracle.setInvalid(address(wbtc), true);
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 0);
        PositionView memory v = engine.getPositionView(alice, address(wbtc));
        assertFalse(v.priceValid);
        assertEq(v.collateralValueUsd, 0);
        assertEq(v.maxDebtUsd, 0);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.OraclePriceInvalid.selector, address(wbtc)));
        engine.borrow(address(wbtc), 1);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.OraclePriceInvalid.selector, address(wbtc)));
        engine.getCollateralValue(alice, address(wbtc));
    }

    // ------------------------------------------------------------------ repay

    function test_repay_partialFullAndOverRepayClamps() public {
        _openWorkedExample(alice);
        musd.mint(alice, 10_000e18);
        vm.startPrank(alice);
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingEngine.Repaid(alice, address(wbtc), alice, 1_000e18, 5_000e18);
        engine.repay(address(wbtc), 1_000e18);
        assertEq(_pos(alice, address(wbtc)).debt, 5_000e18);
        uint256 balBefore = musd.balanceOf(alice);
        engine.repay(address(wbtc), type(uint256).max); // over-repay clamps to debt
        assertEq(_pos(alice, address(wbtc)).debt, 0);
        assertEq(balBefore - musd.balanceOf(alice), 5_000e18, "only the debt is pulled");
        vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector); // debt == 0
        engine.repay(address(wbtc), 1);
        vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector);
        engine.repay(address(wbtc), 0);
        vm.stopPrank();
        assertEq(pool.getOutstandingDebt(address(wbtc)), 0);
        assertEq(pool.getAvailableLiquidity(), POOL_FUNDING);
        _assertPoolConsistent();
    }

    function test_repayOnBehalf_payerIsCaller() public {
        _openWorkedExample(alice);
        musd.mint(bob, 6_000e18);
        _approveMusd(bob);
        vm.prank(bob);
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingEngine.Repaid(alice, address(wbtc), bob, 6_000e18, 0);
        engine.repayOnBehalf(alice, address(wbtc), 6_000e18);
        assertEq(_pos(alice, address(wbtc)).debt, 0);
        assertEq(musd.balanceOf(bob), 0);
        assertEq(musd.balanceOf(alice), 6_000e18, "borrower keeps the borrowed MUSD");
    }

    function test_repay_worksWithInvalidOracle() public {
        _openWorkedExample(alice);
        oracle.setInvalid(address(wbtc), true);
        vm.prank(alice);
        engine.repay(address(wbtc), 6_000e18);
        assertEq(_pos(alice, address(wbtc)).debt, 0);
    }

    // ------------------------------------------------------------------ withdraw

    function test_withdraw_noDebtFullWithdrawal() public {
        _deposit(alice, wbtc, 1e8);
        vm.expectEmit(true, true, true, true);
        emit IMosaicLendingEngine.CollateralWithdrawn(alice, address(wbtc), bob, 1e8, 0);
        vm.prank(alice);
        engine.withdrawCollateral(address(wbtc), 1e8, bob);
        assertEq(wbtc.balanceOf(bob), 1e8);
        assertEq(_pos(alice, address(wbtc)).collateral, 0);
        assertEq(vault.getTotalCollateral(address(wbtc)), 0);
        _assertVaultSolvent(wbtc);
    }

    function test_withdraw_unsafeRejected() public {
        _openWorkedExample(alice); // 0.1 BTC, $6k debt at 60% LTV exactly
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.UnsafeWithdrawal.selector);
        engine.withdrawCollateral(address(wbtc), 1, alice);
        // repay half: debt 3000 -> maxDebt needs >= $5,000 collateral = 0.05 BTC; HF needs 0.0429
        vm.startPrank(alice);
        engine.repay(address(wbtc), 3_000e18);
        vm.expectRevert(IMosaicLendingEngine.UnsafeWithdrawal.selector);
        engine.withdrawCollateral(address(wbtc), 0.05e8 + 1, alice);
        engine.withdrawCollateral(address(wbtc), 0.05e8, alice);
        vm.stopPrank();
        assertEq(_pos(alice, address(wbtc)).collateral, 0.05e8);
        assertEq(engine.getHealthFactor(alice, address(wbtc)), uint256(5_000e18) * 7_000 / 10_000 * WAD / 3_000e18);
    }

    function test_withdraw_rejectsInsufficientZeroAndDust() public {
        _deposit(alice, wbtc, 1e8);
        vm.startPrank(alice);
        vm.expectRevert(IMosaicLendingEngine.InsufficientCollateral.selector);
        engine.withdrawCollateral(address(wbtc), 1e8 + 1, alice);
        vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector);
        engine.withdrawCollateral(address(wbtc), 0, alice);
        vm.expectRevert(IMosaicLendingEngine.BelowMinDeposit.selector);
        engine.withdrawCollateral(address(wbtc), 1e8 - 1, alice); // leaves 1 unit < minDeposit
        vm.stopPrank();
    }

    function test_withdraw_withDebtRequiresValidPrice() public {
        _openWorkedExample(alice);
        oracle.setInvalid(address(wbtc), true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.OraclePriceInvalid.selector, address(wbtc)));
        engine.withdrawCollateral(address(wbtc), 1, alice);
        // but without debt an invalid oracle does not lock collateral
        _deposit(bob, wbtc, 1e8);
        vm.prank(bob);
        engine.withdrawCollateral(address(wbtc), 1e8, bob);
        assertEq(wbtc.balanceOf(bob), 1e8);
    }

    function test_withdraw_allowedWhenAssetPaused() public {
        _deposit(alice, wbtc, 1e8);
        registry.pauseCollateralAsset(address(wbtc));
        vm.prank(alice);
        engine.withdrawCollateral(address(wbtc), 1e8, alice);
        assertEq(wbtc.balanceOf(alice), 1e8);
    }

    // ------------------------------------------------------------------ health factor + views

    function test_healthFactor_workedExample() public {
        _openWorkedExample(alice);
        // $10,000 collateral, 70% threshold, $6,000 debt => HF = 7000/6000 = 1.1667
        assertEq(engine.getHealthFactor(alice, address(wbtc)), 1_166_666_666_666_666_666);
        assertEq(engine.getCollateralValue(alice, address(wbtc)), 10_000e18);
        oracle.setPrice(address(wbtc), 80_000e8, 8); // collateral now $8,000
        uint256 hf = engine.getHealthFactor(alice, address(wbtc));
        assertEq(hf, 933_333_333_333_333_333);
        assertLt(hf, WAD);
        assertTrue(liq.isLiquidatable(alice, address(wbtc)));
        PositionView memory v = engine.getPositionView(alice, address(wbtc));
        assertEq(v.collateralValueUsd, 8_000e18);
        assertEq(v.maxDebtUsd, 4_800e18);
        assertEq(v.availableToBorrow, 0);
        assertEq(v.currentLtvBps, 7_500);
        assertEq(v.price, 80_000e18);
        assertTrue(v.priceValid);
        // liquidation price: debt / (collateral * threshold) = 6000 / (0.1 * 0.7) = $85,714.28
        assertEq(v.liquidationPrice, uint256(6_000e18) * 10_000 * 1e8 / (uint256(0.1e8) * 7_000));
        assertEq(engine.getLiquidationPrice(alice, address(wbtc)), v.liquidationPrice);
    }

    function test_healthFactor_noDebtIsMax() public {
        _deposit(alice, wbtc, 1e8);
        assertEq(engine.getHealthFactor(alice, address(wbtc)), type(uint256).max);
        assertEq(engine.getLiquidationPrice(alice, address(wbtc)), 0);
        oracle.setInvalid(address(wbtc), true);
        assertEq(engine.getHealthFactor(alice, address(wbtc)), type(uint256).max, "no debt => no oracle needed");
    }

    function test_healthFactor_revertsOnInvalidPriceWithDebt() public {
        _openWorkedExample(alice);
        oracle.setInvalid(address(wbtc), true);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.OraclePriceInvalid.selector, address(wbtc)));
        engine.getHealthFactor(alice, address(wbtc));
        PositionView memory v = engine.getPositionView(alice, address(wbtc)); // never reverts
        assertEq(v.healthFactor, 0);
        assertEq(v.debt, 6_000e18);
        assertEq(v.collateral, 0.1e8);
        assertFalse(liq.isLiquidatable(alice, address(wbtc)), "invalid price must not enable liquidation");
    }

    function test_positionView_unsupportedAssetNeverReverts() public view {
        PositionView memory v = engine.getPositionView(alice, makeAddrView("nothing"));
        assertEq(v.collateral, 0);
        assertFalse(v.priceValid);
        assertEq(v.healthFactor, type(uint256).max);
    }

    function makeAddrView(string memory n) internal pure returns (address) {
        return address(uint160(uint256(keccak256(bytes(n)))));
    }

    function test_positionView_availableToBorrowIsMinOfThree() public {
        _deposit(alice, wbtc, 1e8); // headroom 60k
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 60_000e18);
        registry.updateCollateralParameters(address(wbtc), 6_000, 7_000, 800, 10_000e18, 100e8, 1e4);
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 10_000e18, "borrow cap binds");
        vm.prank(lp);
        pool.withdrawLiquidity(POOL_FUNDING - 5_000e18, lp);
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 5_000e18, "liquidity binds");
        registry.pauseCollateralAsset(address(wbtc));
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 0, "paused asset");
        registry.unpauseCollateralAsset(address(wbtc));
        engine.pause();
        assertEq(engine.getBorrowingCapacity(alice, address(wbtc)), 0, "paused engine");
    }

    // ------------------------------------------------------------------ decimal normalisation

    function test_decimals_8decToken8decFeed() public {
        _deposit(alice, wbtc, 0.5e8);
        assertEq(engine.getCollateralValue(alice, address(wbtc)), 50_000e18);
        _borrow(alice, wbtc, 30_000e18);
        assertEq(engine.getHealthFactor(alice, address(wbtc)), uint256(50_000e18) * 7_000 / 10_000 * WAD / 30_000e18);
    }

    function test_decimals_6decToken8decFeed() public {
        _deposit(alice, usd6, 12_345.678901e6);
        assertEq(engine.getCollateralValue(alice, address(usd6)), 12_345.678901e18);
        PositionView memory v = engine.getPositionView(alice, address(usd6));
        assertEq(v.price, 1e18);
        assertEq(v.maxDebtUsd, uint256(12_345.678901e18) * 7_000 / 10_000);
        _borrow(alice, usd6, v.maxDebtUsd);
        vm.prank(alice);
        vm.expectRevert(IMosaicLendingEngine.ExceedsMaxLtv.selector);
        engine.borrow(address(usd6), 1);
    }

    function test_decimals_18decToken18decFeed() public {
        _deposit(alice, e18, 2.5e18); // $2,000 each
        assertEq(engine.getCollateralValue(alice, address(e18)), 5_000e18);
        PositionView memory v = engine.getPositionView(alice, address(e18));
        assertEq(v.price, 2_000e18);
        assertEq(v.maxDebtUsd, 3_000e18);
        _borrow(alice, e18, 3_000e18);
        assertEq(engine.getLiquidationPrice(alice, address(e18)), uint256(3_000e18) * 10_000 * 1e18 / (uint256(2.5e18) * 7_000));
    }

    // ------------------------------------------------------------------ pause behaviour

    function test_pause_blocksDepositBorrowWithdrawLiquidateButRepayWorks() public {
        _openWorkedExample(alice);
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        musd.mint(liquidator, 10_000e18);
        _approveMusd(liquidator);
        engine.pause();
        bytes memory paused = abi.encodeWithSelector(Pausable.EnforcedPause.selector);
        vm.startPrank(alice);
        vm.expectRevert(paused);
        engine.addCollateral(address(wbtc), 1);
        vm.expectRevert(paused);
        engine.openPosition(address(wbtc), 1, 0);
        vm.expectRevert(paused);
        engine.borrow(address(wbtc), 1);
        vm.expectRevert(paused);
        engine.withdrawCollateral(address(wbtc), 1, alice);
        vm.stopPrank();
        vm.prank(liquidator);
        vm.expectRevert(paused);
        liq.liquidate(alice, address(wbtc), 1_000e18);
        vm.prank(alice);
        engine.repay(address(wbtc), 1_000e18); // repay still works
        assertEq(_pos(alice, address(wbtc)).debt, 5_000e18);
        engine.unpause();
        oracle.setPrice(address(wbtc), WBTC_PRICE, 8); // back to $10k collateral: maxDebt 6k vs 5k debt
        vm.prank(alice);
        engine.borrow(address(wbtc), 1e18);
    }

    function test_pause_unauthorized() public {
        vm.startPrank(stranger);
        vm.expectRevert(_unauthorized(stranger, PAUSER_ROLE));
        engine.pause();
        vm.expectRevert(_unauthorized(stranger, PAUSER_ROLE));
        engine.unpause();
        vm.stopPrank();
    }

    function test_assetPaused_blocksBorrowDepositAllowsRepayWithdrawLiquidate() public {
        _openWorkedExample(alice);
        _openWorkedExample(bob);
        registry.pauseCollateralAsset(address(wbtc));
        vm.startPrank(alice);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.AssetNotActive.selector, address(wbtc)));
        engine.borrow(address(wbtc), 1);
        vm.expectRevert(abi.encodeWithSelector(IMosaicLendingEngine.AssetNotActive.selector, address(wbtc)));
        engine.addCollateral(address(wbtc), 1);
        engine.repay(address(wbtc), 6_000e18);
        engine.withdrawCollateral(address(wbtc), 0.1e8, alice);
        vm.stopPrank();
        assertEq(wbtc.balanceOf(alice), 0.1e8);
        // bob gets liquidated while the asset is paused
        oracle.setPrice(address(wbtc), 80_000e8, 8);
        musd.mint(liquidator, 10_000e18);
        _approveMusd(liquidator);
        vm.prank(liquidator);
        liq.liquidate(bob, address(wbtc), 6_000e18);
        assertEq(_pos(bob, address(wbtc)).debt, 0);
    }

    // ------------------------------------------------------------------ role gating on every privileged function

    function test_roles_vaultOnlyEngine() public {
        vm.startPrank(stranger);
        vm.expectRevert(_unauthorized(stranger, ENGINE_ROLE));
        vault.depositCollateral(address(wbtc), stranger, 1);
        vm.expectRevert(_unauthorized(stranger, ENGINE_ROLE));
        vault.withdrawCollateral(address(wbtc), alice, stranger, 1);
        vm.stopPrank();
    }

    function test_roles_poolGating() public {
        vm.startPrank(stranger);
        vm.expectRevert(_unauthorized(stranger, LIQUIDITY_PROVIDER_ROLE));
        pool.depositLiquidity(1);
        vm.expectRevert(_unauthorized(stranger, LIQUIDITY_PROVIDER_ROLE));
        pool.withdrawLiquidity(1, stranger);
        vm.expectRevert(_unauthorized(stranger, ENGINE_ROLE));
        pool.lendToBorrower(address(wbtc), stranger, 1);
        vm.expectRevert(_unauthorized(stranger, ENGINE_ROLE));
        pool.receiveRepayment(address(wbtc), 1);
        vm.expectRevert(_unauthorized(stranger, ENGINE_ROLE));
        pool.writeOffBadDebt(address(wbtc), 1);
        vm.stopPrank();
    }

    function test_roles_engineLiquidatePositionOnlyLiquidationEngine() public {
        _openWorkedExample(alice);
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, LIQUIDATION_ENGINE_ROLE));
        engine.liquidatePosition(alice, address(wbtc), stranger, 1, 1);
        // even the admin cannot seize collateral directly
        vm.expectRevert(_unauthorized(admin, LIQUIDATION_ENGINE_ROLE));
        engine.liquidatePosition(alice, address(wbtc), admin, 1, 1);
    }

    function test_roles_adminCanGrantAndRevoke() public {
        registry.grantRole(RISK_MANAGER_ROLE, bob);
        vm.prank(bob);
        registry.pauseCollateralAsset(address(wbtc));
        registry.revokeRole(RISK_MANAGER_ROLE, bob);
        vm.prank(bob);
        vm.expectRevert(_unauthorized(bob, RISK_MANAGER_ROLE));
        registry.unpauseCollateralAsset(address(wbtc));
    }

    // ------------------------------------------------------------------ pool LP behaviour

    function test_pool_lpCannotWithdrawLentOutFunds() public {
        _deposit(alice, wbtc, 1e8);
        _borrow(alice, wbtc, 60_000e18);
        vm.startPrank(lp);
        vm.expectRevert(IMosaicLendingPool.InsufficientLiquidity.selector);
        pool.withdrawLiquidity(POOL_FUNDING - 60_000e18 + 1, lp);
        pool.withdrawLiquidity(POOL_FUNDING - 60_000e18, lp);
        vm.stopPrank();
        assertEq(pool.getAvailableLiquidity(), 0);
        assertEq(pool.getTotalPoolAssets(), 60_000e18);
        assertEq(musd.balanceOf(lp), POOL_FUNDING - 60_000e18);
    }

    function test_pool_depositEmitsAndZeroRejected() public {
        musd.mint(lp, 1e18);
        vm.startPrank(lp);
        vm.expectEmit(true, false, false, true);
        emit IMosaicLendingPool.LiquidityDeposited(lp, 1e18);
        pool.depositLiquidity(1e18);
        vm.expectRevert(IMosaicLendingPool.ZeroAmount.selector);
        pool.depositLiquidity(0);
        vm.expectRevert(IMosaicLendingPool.ZeroAmount.selector);
        pool.withdrawLiquidity(0, lp);
        vm.stopPrank();
        assertEq(pool.getAvailableLiquidity(), POOL_FUNDING + 1e18);
    }

    function test_pool_accountingMismatchGuards() public {
        // engine-only functions guard against over-crediting
        vm.startPrank(address(engine));
        vm.expectRevert(IMosaicLendingPool.AccountingMismatch.selector);
        pool.receiveRepayment(address(wbtc), 1);
        vm.expectRevert(IMosaicLendingPool.AccountingMismatch.selector);
        pool.writeOffBadDebt(address(wbtc), 1);
        vm.expectRevert(ICollateralVault.AccountingMismatch.selector);
        vault.depositCollateral(address(wbtc), alice, 1); // no tokens actually arrived
        vm.expectRevert(ICollateralVault.InsufficientCollateral.selector);
        vault.withdrawCollateral(address(wbtc), alice, alice, 1);
        vm.stopPrank();
    }
}
