// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";
import {MosaicMath} from "../contracts/libraries/MosaicMath.sol";

/// @dev Fuzz + stateful invariant checks for accounting, math and safety properties.
contract InvariantsTest is BaseTest {
    // ------------------------------------------------------------------ pure math

    function testFuzz_healthFactorMath(uint128 collateralUsd, uint16 thr, uint128 debt) public pure {
        thr = uint16(bound(thr, 1, 9_500));
        uint256 hf = MosaicMath.healthFactor(collateralUsd, thr, debt);
        if (debt == 0) {
            assertEq(hf, type(uint256).max);
        } else {
            // HF < 1 iff collateralUsd * thr < debt * BPS
            bool under = uint256(collateralUsd) * thr < uint256(debt) * 10_000;
            assertEq(hf < 1e18, under);
        }
    }

    function testFuzz_toUsdFromUsdRoundTrip(uint64 amount, uint8 tokenDec, uint8 priceDec, uint64 priceRaw)
        public
        pure
    {
        tokenDec = uint8(bound(tokenDec, 0, 18));
        priceDec = uint8(bound(priceDec, 0, 18));
        // price between $0.01 and $1,000,000 in the feed's own decimals
        uint256 unit = 10 ** priceDec;
        uint256 price = bound(priceRaw, unit / 100 == 0 ? 1 : unit / 100, unit * 1_000_000);
        uint256 usd = MosaicMath.toUsd(amount, tokenDec, price, priceDec);
        uint256 back = MosaicMath.fromUsd(usd, tokenDec, price, priceDec);
        assertLe(back, amount, "round trip never creates tokens");
        // toUsd floors by < 1 USD-wei, which is worth at most this many token units
        uint256 tolerance = MosaicMath.fromUsd(1, tokenDec, price, priceDec) + 1;
        assertLe(amount - back, tolerance, "rounding loss bounded by one USD-wei");
    }

    function testFuzz_decimalNormalisationAgreesAcrossDecimals(uint64 whole, uint8 tokenDec) public pure {
        tokenDec = uint8(bound(tokenDec, 0, 18));
        // 1 whole token at $1 (8-dec price) must always be $1 (18-dec), regardless of token decimals
        uint256 amount = uint256(whole) * 10 ** tokenDec;
        assertEq(MosaicMath.toUsd(amount, tokenDec, 1e8, 8), uint256(whole) * 1e18);
        assertEq(MosaicMath.toUsd(amount, tokenDec, 1e18, 18), uint256(whole) * 1e18);
    }

    function testFuzz_liquidationPriceIsBreakEven(uint64 collateralWhole, uint64 debtWhole, uint16 thr) public pure {
        thr = uint16(bound(thr, 100, 9_500));
        uint256 collateral = uint256(bound(collateralWhole, 1, 10_000_000)) * 1e8; // up to 10M BTC
        uint256 debt = uint256(bound(debtWhole, 1, 10_000_000_000)) * 1e18; // up to $10B
        uint256 lp = MosaicMath.liquidationPrice(debt, collateral, 8, thr);
        // at the liquidation price (as an 18-dec price), HF is within rounding of 1
        uint256 usd = MosaicMath.toUsd(collateral, 8, lp, 18);
        uint256 hf = MosaicMath.healthFactor(usd, thr, debt);
        assertApproxEqRel(hf, 1e18, 1e12); // 1e-6 relative tolerance for integer rounding
    }

    // ------------------------------------------------------------------ stateful properties

    function testFuzz_depositWithdraw_vaultCoversAccounting(uint64 a, uint64 b, uint64 w) public {
        uint256 da = bound(a, 1e4, 10e8);
        uint256 db = bound(b, 1e4, 10e8);
        _deposit(alice, wbtc, da);
        _deposit(bob, wbtc, db);
        _assertVaultSolvent(wbtc);
        uint256 wa = bound(w, 0, da);
        if (wa > 0 && (da - wa == 0 || da - wa >= 1e4)) {
            vm.prank(alice);
            engine.withdrawCollateral(address(wbtc), wa, alice);
        }
        _assertVaultSolvent(wbtc);
        assertEq(
            vault.getTotalCollateral(address(wbtc)),
            vault.getCollateralBalance(alice, address(wbtc)) + vault.getCollateralBalance(bob, address(wbtc))
        );
        assertEq(_pos(alice, address(wbtc)).collateral, vault.getCollateralBalance(alice, address(wbtc)));
    }

    function testFuzz_borrowRepay_poolBalanceTracksFlows(uint64 c, uint64 b, uint64 r) public {
        uint256 col = bound(c, 1e4, 10e8);
        _deposit(alice, wbtc, col);
        uint256 maxDebt = engine.getBorrowingCapacity(alice, address(wbtc));
        uint256 borrowAmt = bound(b, 0, maxDebt);
        if (borrowAmt > 0) _borrow(alice, wbtc, borrowAmt);
        assertEq(pool.getAvailableLiquidity(), POOL_FUNDING - borrowAmt);
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING);
        _assertPoolConsistent();
        uint256 repayAmt = bound(r, 0, borrowAmt * 2);
        if (borrowAmt > 0 && repayAmt > 0) {
            musd.mint(alice, repayAmt);
            _approveMusd(alice);
            uint256 debtBefore = _pos(alice, address(wbtc)).debt;
            vm.prank(alice);
            engine.repay(address(wbtc), repayAmt);
            uint256 debtAfter = _pos(alice, address(wbtc)).debt;
            assertLe(debtAfter, debtBefore, "repay cannot increase debt");
            assertEq(debtBefore - debtAfter, repayAmt > debtBefore ? debtBefore : repayAmt);
            assertEq(pool.getAvailableLiquidity(), POOL_FUNDING - debtAfter);
        }
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING, "no interest, no loss => assets constant");
        _assertPoolConsistent();
    }

    function testFuzz_borrowNeverExceedsMaxLtv(uint64 c, uint128 b) public {
        uint256 col = bound(c, 1e4, 10e8);
        _deposit(alice, wbtc, col);
        uint256 maxDebt = MosaicMath.maxDebt(MosaicMath.toUsd(col, 8, WBTC_PRICE, 8), 6_000);
        vm.prank(alice);
        if (b == 0) {
            vm.expectRevert(IMosaicLendingEngine.ZeroAmount.selector);
        } else if (b > maxDebt) {
            vm.expectRevert(IMosaicLendingEngine.ExceedsMaxLtv.selector);
        }
        engine.borrow(address(wbtc), b);
        assertLe(_pos(alice, address(wbtc)).debt, maxDebt);
        if (_pos(alice, address(wbtc)).debt > 0) assertGe(engine.getHealthFactor(alice, address(wbtc)), WAD);
    }

    function testFuzz_withdrawNeverLeavesUnsafePosition(uint64 w) public {
        _openWorkedExample(alice);
        musd.mint(alice, 10_000e18);
        vm.prank(alice);
        engine.repay(address(wbtc), 3_000e18);
        uint256 amount = bound(w, 1, 0.1e8);
        vm.prank(alice);
        (bool ok,) = address(engine).call(
            abi.encodeWithSelector(IMosaicLendingEngine.withdrawCollateral.selector, address(wbtc), amount, alice)
        );
        if (ok) {
            PositionView memory v = engine.getPositionView(alice, address(wbtc));
            assertGe(v.healthFactor, WAD);
            assertLe(v.debt, v.maxDebtUsd);
        }
        _assertVaultSolvent(wbtc);
    }

    function testFuzz_liquidationSeizeBoundedAndAccountingHolds(uint64 priceDrop, uint128 repay) public {
        _openWorkedExample(alice);
        musd.mint(liquidator, 100_000e18);
        _approveMusd(liquidator);
        uint256 price = bound(priceDrop, 10_000e8, 85_000e8); // below the $85,714 liquidation price
        oracle.setPrice(address(wbtc), price, 8);
        assertTrue(liq.isLiquidatable(alice, address(wbtc)));
        uint256 repayAmt = bound(repay, 1, 6_000e18);
        (uint256 d, uint256 c,,) = liq.getLiquidationQuote(alice, address(wbtc), repayAmt);
        uint256 liqBefore = wbtc.balanceOf(liquidator);
        uint256 musdBefore = musd.balanceOf(liquidator);
        vm.prank(liquidator);
        liq.liquidate(alice, address(wbtc), repayAmt);
        Position memory p = _pos(alice, address(wbtc));
        assertEq(wbtc.balanceOf(liquidator) - liqBefore, c);
        assertEq(musdBefore - musd.balanceOf(liquidator), d);
        assertLe(c, 0.1e8, "cannot seize more than the collateral");
        assertEq(p.collateral, 0.1e8 - c);
        if (p.collateral == 0) {
            assertEq(p.debt, 0, "exhausted collateral => debt written off");
            assertEq(pool.totalBadDebt(), 6_000e18 - d);
        } else {
            assertEq(p.debt, 6_000e18 - d);
            assertEq(pool.totalBadDebt(), 0);
        }
        assertEq(pool.getOutstandingDebt(address(wbtc)), p.debt);
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING - pool.totalBadDebt());
        _assertPoolConsistent();
        _assertVaultSolvent(wbtc);
        // a position with no debt can never be liquidated again
        if (p.debt == 0) {
            vm.prank(liquidator);
            vm.expectRevert(MosaicLiquidationEngine.NotLiquidatable.selector);
            liq.liquidate(alice, address(wbtc), 1);
        }
    }

    function testFuzz_lpCannotWithdrawLentOutFunds(uint64 b, uint128 w) public {
        _deposit(alice, wbtc, 1e8);
        uint256 borrowAmt = bound(b, 1, 60_000e18);
        _borrow(alice, wbtc, borrowAmt);
        uint256 idle = POOL_FUNDING - borrowAmt;
        vm.prank(lp);
        if (w == 0) {
            vm.expectRevert(IMosaicLendingPool.ZeroAmount.selector);
        } else if (w > idle) {
            vm.expectRevert(IMosaicLendingPool.InsufficientLiquidity.selector);
        }
        pool.withdrawLiquidity(w, lp);
        assertGe(pool.getTotalPoolAssets(), borrowAmt, "lent-out funds are never withdrawable");
    }

}

/// @dev Handler for the stateful invariant run: random user actions, price moves and liquidations.
///      Every call is wrapped so reverts (expected guards) do not abort the run.
contract MosaicHandler is Test {
    MosaicLendingEngine internal engine;
    MosaicLiquidationEngine internal liq;
    TestPriceOracle internal oracle;
    MockERC20 internal wbtc;
    MockERC20 internal musd;
    address[2] internal users;
    address internal liquidator;

    uint256 public calls;
    uint256 public liquidations;

    constructor(
        MosaicLendingEngine engine_,
        MosaicLiquidationEngine liq_,
        TestPriceOracle oracle_,
        MockERC20 wbtc_,
        MockERC20 musd_,
        address a,
        address b,
        address liquidator_
    ) {
        engine = engine_;
        liq = liq_;
        oracle = oracle_;
        wbtc = wbtc_;
        musd = musd_;
        users = [a, b];
        liquidator = liquidator_;
        for (uint256 i; i < 2; i++) {
            vm.startPrank(users[i]);
            wbtc.approve(address(engine), type(uint256).max);
            musd.approve(address(engine), type(uint256).max);
            vm.stopPrank();
        }
        vm.prank(liquidator);
        musd.approve(address(engine), type(uint256).max);
    }

    function deposit(uint8 u, uint64 amount) external {
        address user = users[u % 2];
        uint256 amt = bound(amount, 1, 5e8);
        wbtc.mint(user, amt);
        vm.prank(user);
        try engine.addCollateral(address(wbtc), amt) {} catch {}
        calls++;
    }

    function borrow(uint8 u, uint128 amount) external {
        address user = users[u % 2];
        vm.prank(user);
        try engine.borrow(address(wbtc), bound(amount, 1, 100_000e18)) {} catch {}
        calls++;
    }

    function repay(uint8 u, uint128 amount) external {
        address user = users[u % 2];
        uint256 amt = bound(amount, 1, 100_000e18);
        musd.mint(user, amt);
        vm.prank(user);
        try engine.repay(address(wbtc), amt) {} catch {}
        calls++;
    }

    function withdraw(uint8 u, uint64 amount) external {
        address user = users[u % 2];
        vm.prank(user);
        try engine.withdrawCollateral(address(wbtc), bound(amount, 1, 5e8), user) {} catch {}
        calls++;
    }

    function movePrice(uint64 p) external {
        oracle.setPrice(address(wbtc), bound(p, 20_000e8, 200_000e8), 8);
        calls++;
    }

    function liquidate(uint8 u, uint128 amount) external {
        address user = users[u % 2];
        uint256 amt = bound(amount, 1, 100_000e18);
        musd.mint(liquidator, amt);
        vm.prank(liquidator);
        try liq.liquidate(user, address(wbtc), amt) {
            liquidations++;
        } catch {}
        calls++;
    }
}

/// @dev Stateful invariants over random sequences of handler actions.
contract StatefulInvariantTest is BaseTest {
    MosaicHandler internal handler;

    function setUp() public override {
        super.setUp();
        // generous caps so the handler actually exercises borrowing
        registry.updateCollateralParameters(address(wbtc), 6_000, 7_000, 800, 1_000_000e18, 1_000e8, 1e4);
        handler = new MosaicHandler(engine, liq, oracle, wbtc, musd, alice, bob, liquidator);
        targetContract(address(handler));
    }

    function invariant_vaultBalanceCoversAccounting() public view {
        _assertVaultSolvent(wbtc);
        assertEq(
            vault.getTotalCollateral(address(wbtc)),
            _pos(alice, address(wbtc)).collateral + _pos(bob, address(wbtc)).collateral
        );
    }

    function invariant_poolBalanceEqualsLiquidityAndAssetsTrackFunding() public view {
        _assertPoolConsistent();
        // 0% interest: pool assets only ever shrink by written-off bad debt
        assertEq(pool.getTotalPoolAssets(), POOL_FUNDING - pool.totalBadDebt());
    }

    function invariant_assetDebtEqualsSumOfPositionDebt() public view {
        assertEq(
            pool.getOutstandingDebt(address(wbtc)), _pos(alice, address(wbtc)).debt + _pos(bob, address(wbtc)).debt
        );
        assertEq(pool.getTotalOutstandingDebt(), pool.getOutstandingDebt(address(wbtc)));
    }

    function invariant_noDebtWithoutCollateral() public view {
        Position memory a = _pos(alice, address(wbtc));
        Position memory b = _pos(bob, address(wbtc));
        if (a.collateral == 0) assertEq(a.debt, 0);
        if (b.collateral == 0) assertEq(b.debt, 0);
    }
}
