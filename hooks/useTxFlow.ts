"use client";
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePublicClient, useWalletClient } from "wagmi";
import type { Address, Hash } from "viem";
import { approveToken, type WriteContext } from "@/lib/blockchain/writes";
import { readAllowance } from "@/lib/blockchain/reads";
import { decodeContractError, decodeRevertFromData, WrongNetworkError, type DecodedError } from "@/lib/blockchain/errors";
import { MEZO_TESTNET_CHAIN_ID } from "@/lib/blockchain/chains";
import { qk } from "@/lib/blockchain/queryKeys";
import type { TxFlowStatus } from "@/types/mosaic";

export interface ApprovalNeed {
  token: Address;
  spender: Address;
  amount: bigint;
}

export interface TxPlan {
  /** ERC-20 approval to check first; skipped when the current allowance already covers `amount`. */
  approval?: ApprovalNeed;
  /** The main write. Receives a context whose wallet is already verified to be on chain 31611. */
  write: (ctx: WriteContext) => Promise<Hash>;
}

export interface TxFlowState {
  status: TxFlowStatus;
  hash: Hash | null;
  approvalHash: Hash | null;
  error: DecodedError | null;
  blockNumber: bigint | null;
}

const initial: TxFlowState = { status: "idle", hash: null, approvalHash: null, error: null, blockNumber: null };

/**
 * approve-if-needed -> write -> wait for receipt -> invalidate ["mosaic"] queries.
 * States: idle | review | approving | submitting | pending | confirmed | reverted.
 * Success is only shown after the receipt says status === "success".
 */
export function useTxFlow() {
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TxFlowState>(initial);
  const running = useRef(false);

  const reset = useCallback(() => setState(initial), []);
  const review = useCallback(() => setState({ ...initial, status: "review" }), []);

  const execute = useCallback(
    async (plan: TxPlan) => {
      if (running.current) return;
      if (!publicClient || !walletClient) {
        setState((s) => ({ ...s, status: "review", error: { code: "NoWallet", message: "Connect a wallet first." } }));
        return;
      }
      running.current = true;
      const ctx: WriteContext = { wallet: walletClient, publicClient };
      try {
        if (walletClient.chain?.id !== MEZO_TESTNET_CHAIN_ID) throw new WrongNetworkError(walletClient.chain?.id);
        const owner = walletClient.account.address;

        let approvalHash: Hash | null = null;
        if (plan.approval) {
          const { token, spender, amount } = plan.approval;
          const current = await readAllowance(publicClient, token, owner, spender);
          if (current < amount) {
            setState({ ...initial, status: "approving" });
            approvalHash = await approveToken(ctx, token, spender, amount);
            setState({ ...initial, status: "approving", approvalHash });
            const r = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
            if (r.status !== "success") {
              setState({ ...initial, status: "reverted", approvalHash, error: { code: "ApprovalReverted", message: "The approval transaction reverted. Nothing else was sent." } });
              return;
            }
            await queryClient.invalidateQueries({ queryKey: qk.allowance(token, owner, spender) });
          }
        }

        setState({ ...initial, status: "submitting", approvalHash });
        const hash = await plan.write(ctx);
        setState({ ...initial, status: "pending", approvalHash, hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status === "success") {
          setState({ status: "confirmed", approvalHash, hash, error: null, blockNumber: receipt.blockNumber });
        } else {
          const error = await replayRevert(publicClient, hash, receipt.blockNumber);
          setState({ status: "reverted", approvalHash, hash, error, blockNumber: receipt.blockNumber });
        }
        await queryClient.invalidateQueries({ queryKey: qk.all });
      } catch (err) {
        const error = decodeContractError(err);
        setState((s) => ({ ...s, status: s.hash ? "reverted" : "review", error }));
      } finally {
        running.current = false;
      }
    },
    [publicClient, walletClient, queryClient],
  );

  const busy = state.status === "approving" || state.status === "submitting" || state.status === "pending";
  return { ...state, busy, execute, reset, review };
}

/** Re-run a mined-but-reverted tx as an eth_call at its block to recover the revert data. */
async function replayRevert(client: NonNullable<ReturnType<typeof usePublicClient>>, hash: Hash, blockNumber: bigint): Promise<DecodedError> {
  try {
    const tx = await client.getTransaction({ hash });
    await client.call({ account: tx.from, to: tx.to ?? undefined, data: tx.input, value: tx.value, blockNumber });
    return decodeRevertFromData(undefined);
  } catch (err) {
    const decoded = decodeContractError(err);
    return decoded.code === "Unknown" ? decodeRevertFromData(undefined) : decoded;
  }
}
