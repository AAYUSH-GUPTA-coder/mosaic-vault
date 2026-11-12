// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CollateralRegistry} from "../contracts/CollateralRegistry.sol";
import {CollateralVault} from "../contracts/CollateralVault.sol";
import {MosaicLendingPool} from "../contracts/MosaicLendingPool.sol";
import {MosaicLendingEngine} from "../contracts/MosaicLendingEngine.sol";
import {MosaicLiquidationEngine} from "../contracts/MosaicLiquidationEngine.sol";
import {TestPriceOracle} from "../contracts/oracles/TestPriceOracle.sol";
import {ChainlinkFeedOracleAdapter} from "../contracts/oracles/ChainlinkFeedOracleAdapter.sol";
import {MockERC20} from "../contracts/test/MockERC20.sol";
import {MockAggregatorV3} from "../contracts/test/MockAggregatorV3.sol";
import {IMosaicTypes} from "../contracts/interfaces/IMosaicTypes.sol";
import {IMosaicLendingEngine} from "../contracts/interfaces/IMosaicLendingEngine.sol";
import {ICollateralRegistry} from "../contracts/interfaces/ICollateralRegistry.sol";
import {ICollateralVault} from "../contracts/interfaces/ICollateralVault.sol";
import {IMosaicLendingPool} from "../contracts/interfaces/IMosaicLendingPool.sol";
import {IPriceOracleAdapter} from "../contracts/interfaces/IPriceOracleAdapter.sol";

/// @dev Shared fixture: three collateral tokens (8/6/18 decimals), test oracle, funded pool.
abstract contract BaseTest is Test, IMosaicTypes {
    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;

    MockERC20 internal musd;
    MockERC20 internal wbtc; // 8 dec, price 8 dec
    MockERC20 internal usd6; // 6 dec, price 8 dec
    MockERC20 internal e18; // 18 dec, price 18 dec

    TestPriceOracle internal oracle;
    ChainlinkFeedOracleAdapter internal feedAdapter;
    MockAggregatorV3 internal aggregator;
    CollateralRegistry internal registry;
    CollateralVault internal vault;
    MosaicLendingPool internal pool;
    MosaicLendingEngine internal engine;
    MosaicLiquidationEngine internal liq;

    address internal admin = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal lp = makeAddr("lp");
    address internal liquidator = makeAddr("liquidator");
    address internal stranger = makeAddr("stranger");

    // cached so tests do not consume a vm.prank with a view call
    bytes32 internal RISK_MANAGER_ROLE;
    bytes32 internal ORACLE_MANAGER_ROLE;
    bytes32 internal ENGINE_ROLE;
    bytes32 internal LIQUIDITY_PROVIDER_ROLE;
    bytes32 internal PAUSER_ROLE;
    bytes32 internal LIQUIDATION_ENGINE_ROLE;

    uint256 internal constant WBTC_PRICE = 100_000e8; // $100,000 with 8 dec
    uint256 internal constant POOL_FUNDING = 100_000e18;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        musd = new MockERC20("Mezo USD", "MUSD", 18);
        wbtc = new MockERC20("Wrapped BTC", "WBTC", 8);
        usd6 = new MockERC20("USD Six", "USD6", 6);
        e18 = new MockERC20("Eighteen", "E18", 18);

        oracle = new TestPriceOracle(admin);
        aggregator = new MockAggregatorV3(18);
        feedAdapter = new ChainlinkFeedOracleAdapter(admin);
        registry = new CollateralRegistry(admin);
        pool = new MosaicLendingPool(address(musd), admin);
        vault = new CollateralVault(admin);
        engine = new MosaicLendingEngine(address(registry), address(vault), address(pool), address(musd), admin);
        liq = new MosaicLiquidationEngine(address(engine), address(registry), address(musd));

        RISK_MANAGER_ROLE = registry.RISK_MANAGER_ROLE();
        ORACLE_MANAGER_ROLE = oracle.ORACLE_MANAGER_ROLE();
        ENGINE_ROLE = vault.ENGINE_ROLE();
        LIQUIDITY_PROVIDER_ROLE = pool.LIQUIDITY_PROVIDER_ROLE();
        PAUSER_ROLE = engine.PAUSER_ROLE();
        LIQUIDATION_ENGINE_ROLE = engine.LIQUIDATION_ENGINE_ROLE();

        vault.grantRole(vault.ENGINE_ROLE(), address(engine));
        pool.grantRole(pool.ENGINE_ROLE(), address(engine));
        pool.grantRole(pool.LIQUIDITY_PROVIDER_ROLE(), lp);
        engine.grantRole(engine.LIQUIDATION_ENGINE_ROLE(), address(liq));

        oracle.setPrice(address(wbtc), WBTC_PRICE, 8);
        oracle.setPrice(address(usd6), 1e8, 8);
        oracle.setPrice(address(e18), 2_000e18, 18);

        registry.addCollateralAsset(
            address(wbtc), address(oracle), AssetKind.TestOnly, 6_000, 7_000, 800, 1_000_000e18, 100e8, 1e4
        );
        registry.addCollateralAsset(
            address(usd6), address(oracle), AssetKind.TestOnly, 7_000, 8_000, 500, 1_000_000e18, 10_000_000e6, 1e6
        );
        registry.addCollateralAsset(
            address(e18), address(oracle), AssetKind.TestOnly, 6_000, 7_000, 800, 1_000_000e18, 1_000_000e18, 1e15
        );

        musd.mint(lp, POOL_FUNDING);
        vm.startPrank(lp);
        musd.approve(address(pool), type(uint256).max);
        pool.depositLiquidity(POOL_FUNDING);
        vm.stopPrank();
    }

    // ----------------------------------------------------------------------------- helpers

    function _mintAndApprove(MockERC20 token, address user, uint256 amount) internal {
        token.mint(user, amount);
        vm.prank(user);
        token.approve(address(engine), type(uint256).max);
    }

    function _deposit(address user, MockERC20 token, uint256 amount) internal {
        _mintAndApprove(token, user, amount);
        vm.prank(user);
        engine.addCollateral(address(token), amount);
    }

    function _borrow(address user, MockERC20 token, uint256 amount) internal {
        vm.prank(user);
        engine.borrow(address(token), amount);
    }

    function _approveMusd(address user) internal {
        vm.prank(user);
        musd.approve(address(engine), type(uint256).max);
    }

    /// @dev 0.1 WBTC ($10,000) deposited, $6,000 borrowed: the worked example from the brief.
    function _openWorkedExample(address user) internal {
        _deposit(user, wbtc, 0.1e8);
        _borrow(user, wbtc, 6_000e18);
        _approveMusd(user);
    }

    function _unauthorized(address account, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role);
    }

    function _pos(address user, address asset) internal view returns (Position memory) {
        return engine.getPosition(user, asset);
    }

    function _assertVaultSolvent(MockERC20 token) internal view {
        assertGe(token.balanceOf(address(vault)), vault.getTotalCollateral(address(token)), "vault < accounting");
    }

    function _assertPoolConsistent() internal view {
        assertEq(pool.getAvailableLiquidity(), musd.balanceOf(address(pool)), "pool liquidity != balance");
        assertEq(
            pool.getTotalPoolAssets(), pool.getAvailableLiquidity() + pool.getTotalOutstandingDebt(), "pool assets"
        );
    }
}
