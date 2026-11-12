// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

interface IEngineReentry {
    function addCollateral(address asset, uint256 amount) external;
    function withdrawCollateral(address asset, uint256 amount, address to) external;
}

/// @title ReentrantToken
/// @notice Test-only malicious ERC20 that re-enters the lending engine from inside transferFrom (deposit path)
///         or transfer (withdraw path). The re-entrant call is made without try/catch so any revert bubbles up.
contract ReentrantToken is ERC20 {
    enum Mode {
        None,
        ReenterDeposit, // during transferFrom (engine -> vault), call engine.addCollateral
        ReenterWithdraw // during transfer (vault -> user), call engine.withdrawCollateral
    }

    address public engine;
    Mode public mode;
    uint256 public reentryCount;

    constructor() ERC20("Reentrant", "RNT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setAttack(address engine_, Mode mode_) external {
        engine = engine_;
        mode = mode_;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        if (mode == Mode.ReenterDeposit) {
            reentryCount += 1;
            IEngineReentry(engine).addCollateral(address(this), amount);
        }
        return ok;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        if (mode == Mode.ReenterWithdraw) {
            reentryCount += 1;
            IEngineReentry(engine).withdrawCollateral(address(this), amount, to);
        }
        return ok;
    }
}
