"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletButton() {
  return (
    <ConnectButton
      chainStatus="none"
      showBalance={false}
      accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
      label="Connect wallet"
    />
  );
}
