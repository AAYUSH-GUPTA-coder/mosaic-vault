"use client";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { MEZO_TESTNET_CHAIN_ID } from "@/lib/blockchain/chains";

export function useNetwork() {
  const { isConnected, chainId: accountChainId } = useAccount();
  const configChainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();
  const chainId = accountChainId ?? configChainId;
  const isWrongNetwork = isConnected && accountChainId !== MEZO_TESTNET_CHAIN_ID;
  return {
    chainId,
    isConnected,
    isWrongNetwork,
    isSwitching: isPending,
    switchToMezo: () => switchChain({ chainId: MEZO_TESTNET_CHAIN_ID }),
  };
}
