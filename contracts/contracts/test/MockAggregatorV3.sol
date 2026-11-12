// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MockAggregatorV3
/// @notice Test-only AggregatorV3 stand-in for the Mezo BTC/USD precompile (answeredInRound = 0).
contract MockAggregatorV3 {
    uint8 private immutable _decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;
    bool public shouldRevert;

    error MockFeedFailure();

    constructor(uint8 decimals_) {
        _decimals = decimals_;
    }

    function decimals() external view returns (uint8) {
        return _decimals;
    }

    function setAnswer(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
        roundId += 1;
    }

    function setRevert(bool shouldRevert_) external {
        shouldRevert = shouldRevert_;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        if (shouldRevert) revert MockFeedFailure();
        return (roundId, answer, updatedAt, updatedAt, 0);
    }
}
