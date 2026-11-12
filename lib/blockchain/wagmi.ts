import { createConfig, http, type Config, type CreateConfigParameters } from "wagmi";
import type { WalletList } from "@rainbow-me/rainbowkit";
import { injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { mezoTestnet } from "./chains";
import { mosaicConfig } from "./config";

const APP_NAME = "Mosaic Vault";

const transports = {
  [mezoTestnet.id]: http(mosaicConfig.rpcUrl, { batch: true, retryCount: 3, retryDelay: 400 }),
};

type PassportConfigModule = typeof import("@mezo-org/passport/dist/src/config");

/**
 * Wallet connection goes through Mezo Passport (built on RainbowKit).
 * - Bitcoin wallets (Unisat, OKX, Xverse) sign with the user's Bitcoin key; a Mezo smart account
 *   backed by that key holds the EVM address and sends transactions.
 * - Ethereum wallets connect directly. WalletConnect is listed only when
 *   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
 * Mezo Testnet is the only chain.
 */
function buildWallets(projectId: string, passport: PassportConfigModule): WalletList {
  const evm = projectId
    ? [metaMaskWallet, rabbyWallet, walletConnectWallet, injectedWallet]
    : [rabbyWallet, injectedWallet];
  return [
    {
      groupName: "Bitcoin wallets",
      wallets: [passport.unisatWalletMezoTestnet, passport.okxWalletMezoTestnet, passport.xverseWalletMezoTestnet],
    },
    { groupName: "Ethereum wallets", wallets: evm },
  ];
}

/** Server render: no connectors. `ssr: true` lets wagmi hydrate the real connection in the browser. */
function serverConfig() {
  return createConfig({ chains: [mezoTestnet], transports, connectors: [], ssr: true });
}

/**
 * Browser: the Passport config. It is loaded from the deep `config` module because the package
 * root re-exports Passport's UI kit (React 18 only), and its Bitcoin connectors read `window`
 * when they are created.
 */
function browserConfig(): Config {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const passport = require("@mezo-org/passport/dist/src/config") as PassportConfigModule;
  const projectId = mosaicConfig.walletConnectProjectId;
  return passport.getConfig({
    appName: APP_NAME,
    appDescription: "More collateral. More access to Bitcoin-backed liquidity.",
    appUrl: mosaicConfig.appUrl,
    mezoNetwork: "testnet",
    walletConnectProjectId: projectId || "mosaic-vault-no-walletconnect",
    wallets: buildWallets(projectId, passport),
    chains: [mezoTestnet],
    // Passport types this as Pick<CreateConfigParameters, "transports"> but spreads it into
    // RainbowKit's getDefaultConfig, which expects the transport map itself.
    transports: transports as unknown as Pick<CreateConfigParameters, "transports">,
    ssr: true,
  });
}

export const wagmiConfig: ReturnType<typeof serverConfig> =
  typeof window === "undefined" ? serverConfig() : (browserConfig() as ReturnType<typeof serverConfig>);

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
