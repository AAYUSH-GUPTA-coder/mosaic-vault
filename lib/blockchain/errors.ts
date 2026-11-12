import {
  BaseError,
  ContractFunctionRevertedError,
  UserRejectedRequestError,
  decodeErrorResult,
  type Abi,
  type Hex,
} from "viem";
import {
  chainlinkFeedOracleAdapterAbi,
  collateralRegistryAbi,
  collateralVaultAbi,
  mosaicLendingEngineAbi,
  mosaicLendingPoolAbi,
  mosaicLiquidationEngineAbi,
  testCollateralTokenAbi,
  testPriceOracleAbi,
} from "./abis";
import { MEZO_TESTNET_CHAIN_ID } from "./chains";

export class WrongNetworkError extends Error {
  readonly expectedChainId = MEZO_TESTNET_CHAIN_ID;
  constructor(public readonly actualChainId: number | undefined) {
    super(`Wrong network. Switch your wallet to Mezo Testnet (chain ${MEZO_TESTNET_CHAIN_ID}).`);
    this.name = "WrongNetworkError";
  }
}

/** Plain-sentence copy for every custom error in docs/CONTRACTS.md. */
export const ERROR_MESSAGES: Record<string, string> = {
  ExceedsMaxLtv: "This borrow would exceed the asset's maximum loan-to-value.",
  ExceedsBorrowCap: "The protocol has reached the borrow cap for this asset.",
  ExceedsExposureCap: "The protocol has reached the deposit cap for this asset.",
  InsufficientPoolLiquidity: "The pool does not have enough MUSD to lend right now.",
  BelowMinDeposit: "The resulting collateral would be below the minimum deposit for this asset.",
  UnsafeWithdrawal: "Withdrawing this much would leave the position under-collateralised.",
  InsufficientCollateral: "The position does not hold that much collateral.",
  ZeroAmount: "Enter an amount greater than zero.",
  NoDebt: "This position has no debt to repay.",
  AssetNotActive: "This asset is paused or not registered, so new deposits and borrows are blocked.",
  AssetNotSupported: "This asset is not registered as collateral.",
  AssetAlreadyRegistered: "This asset is already registered.",
  InvalidParameters:
    "Parameters are out of range. Max LTV must be below the liquidation threshold (max 95%), and the penalty at most 30%.",
  OraclePriceInvalid: "The oracle price for this asset is missing or stale. Try again when the price updates.",
  InsufficientLiquidity: "The pool does not have enough free MUSD for this withdrawal.",
  AccountingMismatch: "The contract's balance check failed. No funds moved.",
  NotLiquidatable: "This position is not liquidatable. Its health factor is at or above 1.0.",
  EnforcedPause: "The lending engine is paused. Only repayments are allowed right now.",
  ExpectedPause: "The engine is not paused.",
  ReentrancyGuardReentrantCall: "The call was rejected by the reentrancy guard.",
  AccessControlUnauthorizedAccount: "Your wallet does not have the role required for this action.",
  ExceedsFaucetCap: "That is more than the faucet allows in one call. Request a smaller amount.",
  ERC20InsufficientBalance: "Your wallet balance is too low for this amount.",
  ERC20InsufficientAllowance: "The approval is too small for this amount. Approve again.",
  SafeERC20FailedOperation: "The token transfer failed. Check your balance and approval.",
};

const ALL_ABIS: Abi[] = [
  mosaicLendingEngineAbi,
  mosaicLiquidationEngineAbi,
  collateralRegistryAbi,
  collateralVaultAbi,
  mosaicLendingPoolAbi,
  chainlinkFeedOracleAdapterAbi,
  testPriceOracleAbi,
  testCollateralTokenAbi,
  // OpenZeppelin ERC-20 custom errors
  [
    {
      type: "error",
      name: "ERC20InsufficientBalance",
      inputs: [
        { name: "sender", type: "address" },
        { name: "balance", type: "uint256" },
        { name: "needed", type: "uint256" },
      ],
    },
    {
      type: "error",
      name: "ERC20InsufficientAllowance",
      inputs: [
        { name: "spender", type: "address" },
        { name: "allowance", type: "uint256" },
        { name: "needed", type: "uint256" },
      ],
    },
    { type: "error", name: "SafeERC20FailedOperation", inputs: [{ name: "token", type: "address" }] },
  ] as const,
];

export interface DecodedError {
  /** Short machine name, e.g. "ExceedsMaxLtv", "UserRejected", "WrongNetwork", "Unknown". */
  code: string;
  /** Plain sentence for the UI. */
  message: string;
}

function decodeRevertData(data: Hex | undefined): DecodedError | null {
  if (!data || data === "0x") return null;
  for (const abi of ALL_ABIS) {
    try {
      const decoded = decodeErrorResult({ abi, data });
      const name = decoded.errorName;
      return { code: name, message: ERROR_MESSAGES[name] ?? `The transaction reverted with ${name}.` };
    } catch {
      // try next abi
    }
  }
  return null;
}

function isUserRejection(err: unknown): boolean {
  if (err instanceof UserRejectedRequestError) return true;
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return true;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /user rejected|user denied|rejected the request|ACTION_REJECTED/i.test(msg);
}

/** Turn any thrown value from a write/simulate/wait into a plain, user-facing sentence. */
export function decodeContractError(err: unknown): DecodedError {
  if (err instanceof WrongNetworkError) return { code: "WrongNetwork", message: err.message };
  if (isUserRejection(err)) {
    return { code: "UserRejected", message: "You rejected the request in your wallet. Nothing was sent." };
  }
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      const name = reverted.data?.errorName ?? reverted.reason;
      if (name && ERROR_MESSAGES[name]) return { code: name, message: ERROR_MESSAGES[name] };
      const fromRaw = decodeRevertData(reverted.raw);
      if (fromRaw) return fromRaw;
      if (name) return { code: name, message: `The transaction reverted with ${name}.` };
    }
    const raw = extractRevertData(err);
    const decoded = decodeRevertData(raw);
    if (decoded) return decoded;
    if (/insufficient funds/i.test(err.shortMessage)) {
      return { code: "InsufficientGas", message: "Not enough BTC in your wallet to pay for gas." };
    }
    return { code: "Unknown", message: err.shortMessage || "The transaction failed." };
  }
  if (err instanceof Error) {
    const decoded = decodeRevertData(extractRevertData(err));
    if (decoded) return decoded;
    return { code: "Unknown", message: err.message || "Something went wrong." };
  }
  return { code: "Unknown", message: "Something went wrong." };
}

function extractRevertData(err: unknown): Hex | undefined {
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { data?: unknown; cause?: unknown };
    if (typeof o.data === "string" && o.data.startsWith("0x") && o.data.length >= 10) return o.data as Hex;
    if (o.data && typeof o.data === "object") {
      const d = o.data as { data?: unknown };
      if (typeof d.data === "string" && d.data.startsWith("0x")) return d.data as Hex;
    }
    cur = o.cause;
  }
  return undefined;
}

/** Decode a receipt revert when the tx was mined but failed (status "reverted"). */
export function decodeRevertFromData(data: Hex | undefined): DecodedError {
  return (
    decodeRevertData(data) ?? {
      code: "Reverted",
      message: "The transaction was mined but reverted. Open it in the explorer for details.",
    }
  );
}
