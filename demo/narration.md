# Demo narration (voice: en-US-AndrewNeural)

**s1** (https://mosaic-vault.vercel.app/)

This is Mosaic Vault, a modular lending layer we built on Mezo testnet. Deposit Bitcoin, or another supported asset, and borrow MUSD without selling what you hold.

**s2** (https://mosaic-vault.vercel.app/)

Every asset gets its own isolated vault. If something goes wrong with one collateral type, the damage stays with that asset and never spreads to the others.

**s3** (https://mosaic-vault.vercel.app/collateral)

The collateral page reads straight from the on-chain registry. Each asset has its own maximum loan-to-value, liquidation threshold, penalty, borrow cap and exposure cap. Real testnet BTC is priced by Mezo's own BTC to USD feed, and the oracle adapter rejects any price that has gone stale.

**s4** (https://mosaic-vault.vercel.app/dashboard)

Borrowed MUSD comes from a lending pool that liquidity providers fund. Mosaic never mints MUSD, and it never touches Mezo's native borrowing system. The numbers you see here are read live from the chain.

**s5** (https://mosaic-vault.vercel.app/dashboard)

To use it, you connect with Mezo Passport. It supports Bitcoin wallets like Unisat, OKX and Xverse, as well as regular Ethereum wallets.

**s6** (https://mosaic-vault.vercel.app/protocol)

The protocol page shows exposure against every cap, how fresh each oracle price is, and a live scan for positions that can be liquidated. Managers can also pause the engine in an emergency.

**s7** (https://mosaic-vault.vercel.app/risk)

Risk managers list new assets and tune their parameters here. Every change is an on-chain transaction, and each action is locked to its own role.

**s8** (https://explorer.test.mezo.org/tx/0x23212465d87a2a7f74f1c137c80642ccb8331b48ac24d047f2474f342f73cac5)

All of this is deployed on Mezo testnet. We ran the full journey on-chain: fund the pool, deposit, borrow, add collateral, repay, withdraw, and finally a liquidation after a price drop. This is that liquidation, settled on the Mezo explorer.

**s9** (https://explorer.test.mezo.org/tx/0xf06af4d91db7e0f7fffbcb659f46106c02a92681b185375efb7a6431e4f5430d)

We also borrowed against real testnet BTC, through Mezo's BTC token, then repaid and withdrew it in full.

**s10** (https://mosaic-vault.vercel.app/collateral)

We ran a security review on the contracts and fixed the critical findings, so a liquidation can never write off debt that the collateral still covers. Every contract is linked right here in the footer. Mosaic Vault: more collateral, and more access to Bitcoin-backed liquidity, on Mezo.
