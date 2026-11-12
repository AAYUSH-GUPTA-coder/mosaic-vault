// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Base.t.sol";

contract OracleTest is BaseTest {
    address internal btc = makeAddr("btc");

    function setUp() public override {
        super.setUp();
        aggregator.setAnswer(75_000e18, block.timestamp);
        feedAdapter.setFeed(btc, address(aggregator), 900);
    }

    // --------------------------------------------------------------------- ChainlinkFeedOracleAdapter

    function test_feed_setFeedCachesDecimalsAndEmits() public {
        MockAggregatorV3 agg8 = new MockAggregatorV3(8);
        vm.expectEmit(true, true, false, true);
        emit ChainlinkFeedOracleAdapter.FeedSet(address(wbtc), address(agg8), 8, 600);
        feedAdapter.setFeed(address(wbtc), address(agg8), 600);
        (address a, uint8 d, uint256 s) = feedAdapter.feeds(address(wbtc));
        assertEq(a, address(agg8));
        assertEq(d, 8);
        assertEq(s, 600);
        assertEq(feedAdapter.getPriceDecimals(address(wbtc)), 8);
    }

    function test_feed_setFeedValidation() public {
        bytes memory err = abi.encodeWithSelector(ChainlinkFeedOracleAdapter.InvalidParameters.selector);
        vm.expectRevert(err);
        feedAdapter.setFeed(btc, address(aggregator), 29);
        vm.expectRevert(err);
        feedAdapter.setFeed(btc, address(aggregator), 86_401);
        vm.expectRevert(err);
        feedAdapter.setFeed(btc, address(0), 900);
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, ORACLE_MANAGER_ROLE));
        feedAdapter.setFeed(btc, address(aggregator), 900);
    }

    function test_feed_freshPriceIsValid() public view {
        assertTrue(feedAdapter.isPriceValid(btc));
        (uint256 p, uint256 t) = feedAdapter.getPrice(btc);
        assertEq(p, 75_000e18);
        assertEq(t, block.timestamp);
        IPriceOracleAdapter.PriceData memory d = feedAdapter.getPriceData(btc);
        assertTrue(d.valid);
        assertEq(d.decimals, 18);
    }

    function test_feed_staleRejected() public {
        vm.warp(block.timestamp + 901);
        assertFalse(feedAdapter.isPriceValid(btc));
        vm.expectRevert(abi.encodeWithSelector(IPriceOracleAdapter.OraclePriceInvalid.selector, btc));
        feedAdapter.getPrice(btc);
        // exactly at the boundary is still valid
        aggregator.setAnswer(75_000e18, block.timestamp - 900);
        assertTrue(feedAdapter.isPriceValid(btc));
    }

    function test_feed_zeroAndNegativeRejected() public {
        aggregator.setAnswer(0, block.timestamp);
        assertFalse(feedAdapter.isPriceValid(btc));
        aggregator.setAnswer(-1, block.timestamp);
        assertFalse(feedAdapter.isPriceValid(btc));
        assertFalse(feedAdapter.getPriceData(btc).valid);
        aggregator.setAnswer(1, 0); // updatedAt == 0
        assertFalse(feedAdapter.isPriceValid(btc));
        aggregator.setAnswer(1, block.timestamp + 1); // from the future
        assertFalse(feedAdapter.isPriceValid(btc));
    }

    function test_feed_revertingAggregatorIsInvalidNotReverting() public {
        aggregator.setRevert(true);
        assertFalse(feedAdapter.isPriceValid(btc));
        IPriceOracleAdapter.PriceData memory d = feedAdapter.getPriceData(btc);
        assertFalse(d.valid);
        assertEq(d.price, 0);
        vm.expectRevert(abi.encodeWithSelector(IPriceOracleAdapter.OraclePriceInvalid.selector, btc));
        feedAdapter.getPrice(btc);
    }

    function test_feed_unsetOrCodelessAggregatorIsInvalid() public {
        assertFalse(feedAdapter.isPriceValid(address(usd6)));
        vm.expectRevert(abi.encodeWithSelector(ChainlinkFeedOracleAdapter.InvalidParameters.selector));
        feedAdapter.setFeed(address(usd6), makeAddr("eoa"), 900); // decimals() call fails -> revert on set
    }

    function test_feed_removeFeedInvalidates() public {
        vm.expectEmit(true, false, false, false);
        emit ChainlinkFeedOracleAdapter.FeedRemoved(btc);
        feedAdapter.removeFeed(btc);
        assertFalse(feedAdapter.isPriceValid(btc));
        vm.prank(stranger);
        vm.expectRevert(_unauthorized(stranger, ORACLE_MANAGER_ROLE));
        feedAdapter.removeFeed(btc);
    }

    // --------------------------------------------------------------------- TestPriceOracle

    function test_testOracle_setPriceAndRead() public {
        vm.expectEmit(true, false, false, true);
        emit TestPriceOracle.PriceSet(address(wbtc), 90_000e8, 8, block.timestamp);
        oracle.setPrice(address(wbtc), 90_000e8, 8);
        (uint256 p, uint256 t) = oracle.getPrice(address(wbtc));
        assertEq(p, 90_000e8);
        assertEq(t, block.timestamp);
        assertEq(oracle.getPriceDecimals(address(wbtc)), 8);
        assertEq(
            keccak256(bytes(oracle.LABEL())), keccak256("TEST-ONLY ORACLE: admin-set prices, not market data")
        );
    }

    function test_testOracle_unauthorizedSetters() public {
        vm.startPrank(stranger);
        bytes memory err = _unauthorized(stranger, ORACLE_MANAGER_ROLE);
        vm.expectRevert(err);
        oracle.setPrice(address(wbtc), 1, 8);
        vm.expectRevert(err);
        oracle.setMaxStaleness(address(wbtc), 60);
        vm.expectRevert(err);
        oracle.setInvalid(address(wbtc), true);
        vm.stopPrank();
    }

    function test_testOracle_stalenessDefaultOneDay() public {
        vm.warp(block.timestamp + 1 days);
        assertTrue(oracle.isPriceValid(address(wbtc)));
        vm.warp(block.timestamp + 1);
        assertFalse(oracle.isPriceValid(address(wbtc)));
        oracle.setMaxStaleness(address(wbtc), 3 days);
        assertTrue(oracle.isPriceValid(address(wbtc)));
    }

    function test_testOracle_setInvalidOverride() public {
        vm.expectEmit(true, false, false, true);
        emit TestPriceOracle.ValidityOverridden(address(wbtc), true);
        oracle.setInvalid(address(wbtc), true);
        assertFalse(oracle.isPriceValid(address(wbtc)));
        vm.expectRevert(abi.encodeWithSelector(IPriceOracleAdapter.OraclePriceInvalid.selector, address(wbtc)));
        oracle.getPrice(address(wbtc));
        oracle.setInvalid(address(wbtc), false);
        assertTrue(oracle.isPriceValid(address(wbtc)));
    }

    function test_testOracle_zeroPriceInvalid() public {
        oracle.setPrice(address(wbtc), 0, 8);
        assertFalse(oracle.isPriceValid(address(wbtc)));
        assertFalse(oracle.isPriceValid(makeAddr("never-set")));
    }
}
