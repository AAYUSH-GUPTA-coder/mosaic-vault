// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";
import {ReentrantToken} from "../contracts/test/ReentrantToken.sol";

contract ReentrancyTest is BaseTest {
    ReentrantToken internal rnt;

    function setUp() public override {
        super.setUp();
        rnt = new ReentrantToken();
        oracle.setPrice(address(rnt), 10e8, 8);
        registry.addCollateralAsset(
            address(rnt), address(oracle), AssetKind.TestOnly, 5_000, 6_000, 1_000, 1_000e18, 1_000_000e18, 1
        );
        rnt.mint(alice, 100e18);
        vm.prank(alice);
        rnt.approve(address(engine), type(uint256).max);
    }

    function test_reentrancy_baselineDepositWithdrawWorks() public {
        vm.startPrank(alice);
        engine.addCollateral(address(rnt), 10e18);
        engine.withdrawCollateral(address(rnt), 10e18, alice);
        vm.stopPrank();
        assertEq(rnt.balanceOf(alice), 100e18);
        assertEq(rnt.reentryCount(), 0);
    }

    function test_reentrancy_depositReentryFails() public {
        rnt.setAttack(address(engine), ReentrantToken.Mode.ReenterDeposit);
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        engine.addCollateral(address(rnt), 10e18);
        assertEq(_pos(alice, address(rnt)).collateral, 0, "no credit on failed deposit");
        assertEq(vault.getTotalCollateral(address(rnt)), 0);
        assertEq(rnt.balanceOf(alice), 100e18, "tokens returned by revert");
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        engine.openPosition(address(rnt), 10e18, 0);
    }

    function test_reentrancy_withdrawReentryFails() public {
        vm.prank(alice);
        engine.addCollateral(address(rnt), 10e18);
        rnt.setAttack(address(engine), ReentrantToken.Mode.ReenterWithdraw);
        vm.prank(alice);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        engine.withdrawCollateral(address(rnt), 5e18, alice);
        assertEq(_pos(alice, address(rnt)).collateral, 10e18, "withdraw rolled back");
        assertEq(vault.getTotalCollateral(address(rnt)), 10e18);
        assertEq(rnt.balanceOf(address(vault)), 10e18);
        assertGe(rnt.balanceOf(address(vault)), vault.getTotalCollateral(address(rnt)));
    }

    function test_reentrancy_liquidationPathReentryFails() public {
        vm.prank(alice);
        engine.addCollateral(address(rnt), 10e18); // $100 -> borrow $50
        vm.prank(alice);
        engine.borrow(address(rnt), 50e18);
        oracle.setPrice(address(rnt), 7e8, 8); // $70 * 0.6 = 42 < 50
        musd.mint(liquidator, 100e18);
        _approveMusd(liquidator);
        rnt.setAttack(address(engine), ReentrantToken.Mode.ReenterWithdraw); // fires on vault -> liquidator transfer
        vm.prank(liquidator);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        liq.liquidate(alice, address(rnt), 50e18);
        assertEq(_pos(alice, address(rnt)).debt, 50e18, "liquidation rolled back");
    }
}
