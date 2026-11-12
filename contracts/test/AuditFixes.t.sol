// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";
import {TestCollateralToken} from "../contracts/test/TestCollateralToken.sol";

/// @notice Regression tests for the 2026-11-12 Pashov audit findings (report in .solidity-auditor/).
/// Worked example: 0.1 WBTC collateral, 6,000 MUSD debt, liquidation threshold 70%, penalty 8%.
contract AuditFixesTest is BaseTest {
    uint256 internal constant SOLVENT_PRICE = 62_000e8; // collateral $6,200 >= debt $6,000, HF 0.723

    function setUp() public override {
        super.setUp();
        _openWorkedExample(alice);
        musd.mint(liquidator, 100_000e18);
        _approveMusd(liquidator);
    }

    /// Findings 1-3: the old code let a repay of 6,200 / 1.08 seize all collateral and write off ~259 MUSD.
    function test_solventPosition_partialRepayCannotEmptyCollateral() public {
        oracle.setPrice(address(wbtc), SOLVENT_PRICE, 8);
        assertTrue(liq.isLiquidatable(alice, address(wbtc)));
        uint256 attackRepay = 5_740.75e18; // just above collateral value / (1 + penalty)

        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), attackRepay);

        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pool.totalBadDebt(), 0, "no covered debt written off");
        assertGt(pos.collateral, 0, "collateral not emptied by a partial repay");
        assertEq(pos.debt, 6_000e18 - attackRepay);
        // The remaining position keeps a collateral ratio >= 1, so the pool is still fully backed.
        assertGe(engine.getCollateralValue(alice, address(wbtc)), pos.debt);
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING, "pool lost nothing");
        _assertPoolConsistent();
        _assertVaultSolvent(wbtc);
    }

    /// The liquidator's gain on a solvent position is bounded by the borrower's equity, never the pool.
    function test_solventPosition_fullRepayTakesAllWithoutBadDebt() public {
        oracle.setPrice(address(wbtc), SOLVENT_PRICE, 8);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 6_000e18);
        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pos.debt, 0);
        assertEq(pos.collateral, 0);
        assertEq(pool.totalBadDebt(), 0);
        assertEq(wbtc.balanceOf(liquidator), 0.1e8, "liquidator gains the $200 equity, not the 8% penalty");
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING);
    }

    /// Finding 7: seizing all but one unit must not leave debt backed by dust.
    function test_solventPosition_dustLeftoverStillBacked() public {
        oracle.setPrice(address(wbtc), SOLVENT_PRICE, 8);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 5_999.99e18);
        Position memory pos = _pos(alice, address(wbtc));
        assertGe(engine.getCollateralValue(alice, address(wbtc)), pos.debt, "remaining debt stays backed");
        assertEq(pool.totalBadDebt(), 0);
    }

    /// Defence in depth: the engine refuses a write-off while the collateral covers the debt.
    function test_engineRejectsWriteOffOfCoveredDebt() public {
        oracle.setPrice(address(wbtc), SOLVENT_PRICE, 8);
        engine.grantRole(LIQUIDATION_ENGINE_ROLE, admin);
        vm.expectRevert(MosaicLendingEngine.InvalidParameters.selector);
        engine.liquidatePosition(alice, address(wbtc), liquidator, 5_000e18, 0.1e8);
    }

    /// Underwater positions keep the explicit write-off path (real shortfall).
    function test_underwaterPosition_stillWritesOffShortfall() public {
        oracle.setPrice(address(wbtc), 50_000e8, 8); // collateral $5,000 < debt $6,000
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), 5_000e18); // seizes all collateral, 1,000 MUSD shortfall
        assertEq(_pos(alice, address(wbtc)).debt, 0);
        assertGt(pool.totalBadDebt(), 0);
        _assertPoolConsistent();
    }

    /// Fuzz: on any solvent liquidatable position, any repay leaves no bad debt and a backed remainder.
    function testFuzz_solventLiquidation_neverWritesOffOrUnderbacks(uint256 price, uint256 repay) public {
        price = bound(price, 60_000e8, 85_714e8); // collateral $6,000..$8,571: solvent and liquidatable
        repay = bound(repay, 1e18, 6_000e18);
        oracle.setPrice(address(wbtc), price, 8);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), repay);
        Position memory pos = _pos(alice, address(wbtc));
        assertEq(pool.totalBadDebt(), 0);
        assertGe(engine.getCollateralValue(alice, address(wbtc)), pos.debt);
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING);
        _assertPoolConsistent();
        _assertVaultSolvent(wbtc);
    }

    /// Finding 4: only MINTER_ROLE can mint test collateral, so nobody borrows real MUSD against free tokens.
    function test_testToken_faucetIsMinterOnly() public {
        TestCollateralToken t = new TestCollateralToken("Mosaic Test Wrapped BTC (test-only)", "tWBTC", 8, 10e8);
        bytes memory denied = _unauthorized(stranger, t.MINTER_ROLE());
        vm.prank(stranger);
        vm.expectRevert(denied);
        t.faucet(1e8);
        vm.prank(stranger);
        vm.expectRevert(denied);
        t.mintTo(stranger, 1e8);

        t.mintTo(alice, 1e8); // the deployer holds MINTER_ROLE
        assertEq(t.balanceOf(alice), 1e8);
        vm.expectRevert(abi.encodeWithSelector(TestCollateralToken.ExceedsFaucetCap.selector, 11e8, 10e8));
        t.mintTo(alice, 11e8);
    }
}
