# Mosaic Vault — Handoff Report

Date: 2026-11-12 · Network: Mezo Testnet (chain 31611) · Explorer: https://explorer.test.mezo.org

**Live app:** https://mosaic-vault.vercel.app
**Repo:** https://github.com/AAYUSH-GUPTA-coder/mosaic-vault (private)
**Demo video:** `demo/mosaic-vault-demo.mp4` (2:15, 1080p, Andrew voiceover, burned-in subtitles; `.srt` and narration script alongside)

## What it is

Mosaic Vault is a modular multi-collateral lending layer on Mezo. Each collateral asset sits in its own isolated vault with its own risk parameters. Users borrow MUSD from a pool funded by liquidity providers. Mosaic never mints MUSD and never touches Mezo's native CDP.

## Deployed contracts

| Contract | Address |
|---|---|
| CollateralRegistry | [0xa5E0e0b4c80732a39eC6B04f81201EA2eC3b8D71](https://explorer.test.mezo.org/address/0xa5E0e0b4c80732a39eC6B04f81201EA2eC3b8D71) |
| ChainlinkFeedOracleAdapter | [0x0Bed54D3A5050B5d5C104C9F49abF7ab5aC1B632](https://explorer.test.mezo.org/address/0x0Bed54D3A5050B5d5C104C9F49abF7ab5aC1B632) |
| TestPriceOracle | [0x29eA7fBFE88709d707e95c560B4AA6aAf03eAd14](https://explorer.test.mezo.org/address/0x29eA7fBFE88709d707e95c560B4AA6aAf03eAd14) |
| MosaicLendingPool | [0xbA75a7a58B381D03DFb78500fD0E0543111a0767](https://explorer.test.mezo.org/address/0xbA75a7a58B381D03DFb78500fD0E0543111a0767) |
| CollateralVault | [0x55Bce3bF5cC1311eC05A5F0f7E345DC0Df678B87](https://explorer.test.mezo.org/address/0x55Bce3bF5cC1311eC05A5F0f7E345DC0Df678B87) |
| MosaicLendingEngine | [0x7875c4A42A59b8B62bd38a07d70850E3f6F7244B](https://explorer.test.mezo.org/address/0x7875c4A42A59b8B62bd38a07d70850E3f6F7244B) |
| MosaicLiquidationEngine | [0x2cc16BB09DD1401e8FDD973Fe2fF346Fbe347D20](https://explorer.test.mezo.org/address/0x2cc16BB09DD1401e8FDD973Fe2fF346Fbe347D20) |
| tWBTC (test-only, 8 dec) | [0xe06F05D2CD5EA884c28Ebb5ce8887a4924e4d8FD](https://explorer.test.mezo.org/address/0xe06F05D2CD5EA884c28Ebb5ce8887a4924e4d8FD) |
| tUSD (test-only, 6 dec) | [0xc4468792Ee9BFECae8603559C485A212Aee86ff1](https://explorer.test.mezo.org/address/0xc4468792Ee9BFECae8603559C485A212Aee86ff1) |

Mezo addresses used: MUSD `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503`, BTC ERC-20 precompile `0x7b7C000000000000000000000000000000000000`, BTC/USD feed `0x7b7c000000000000000000000000000000000015`. Deploy block 16734227.

Every deploy, role-grant and registration transaction hash is in `contracts/deployments/mezo-testnet.json`. The full console output of the run is in `contracts/deployments/testnet-run.log`.

## Collateral listed

| Asset | Max LTV | Liq. threshold | Penalty | Borrow cap | Oracle |
|---|---|---|---|---|---|
| BTC (real testnet BTC) | 60% | 70% | 8% | 500 MUSD | Mezo BTC/USD feed via adapter, 900 s max age |
| tWBTC (test-only) | 60% | 70% | 8% | 500 MUSD | TestPriceOracle, 30-day max age |
| tUSD (test-only) | 70% | 80% | 5% | 300 MUSD | TestPriceOracle, 30-day max age |
| RWA | — | — | — | — | Not enabled (needs oracle, custody, legal) |

## Testnet journey (all on-chain)

| Step | Transaction |
|---|---|
| Fund pool: 500 MUSD | [0x24fc8c63…5a24](https://explorer.test.mezo.org/tx/0x24fc8c63a9d3a1b9bd74b706d49d579361a4b2e84ea317811d77827ee3b45a24) |
| Deposit 0.0005 real BTC | [0xf06af4d9…430d](https://explorer.test.mezo.org/tx/0xf06af4d91db7e0f7fffbcb659f46106c02a92681b185375efb7a6431e4f5430d) |
| Borrow 10.91 MUSD against BTC | [0xc9197aac…c322](https://explorer.test.mezo.org/tx/0xc9197aacfb5727d7305280e29645870bde30d6313a383bef842d75bd5dcfc322) |
| Repay all (BTC) | [0xbd96bc35…b964](https://explorer.test.mezo.org/tx/0xbd96bc35e318f54c35d2a0944afbeb045773007cb0fadd35ab82f19bae7db964) |
| Withdraw all BTC | [0xe63061fe…8385](https://explorer.test.mezo.org/tx/0xe63061fe8cae12251a5a54265b444916559d171156aaee652bb4b5d0817b8385) |
| Deposit 0.005 tWBTC | [0xd77611e5…eac](https://explorer.test.mezo.org/tx/0xd77611e5ef1c621ac6a88fe502cf8441278ca42663a1996b8a93bb1e12b56eac) |
| Borrow 109.24 MUSD | [0x3bb360a0…6ad1](https://explorer.test.mezo.org/tx/0x3bb360a001182d4fcf4c262ece89532b35651fa627f310b816c65a85b6ac1d66) |
| Add collateral (HF 2.33 → 3.50) | [0x65ad293c…1785](https://explorer.test.mezo.org/tx/0x65ad293c3210ac4d4e26630b42c3fa97a4514e073c51cbed0c8744dc1bd07785) |
| Repay 54.62 MUSD | [0x28293d6a…6a83c](https://explorer.test.mezo.org/tx/0x28293d6a0bbe28737d6da191ed5163f8f304118a6db7162cc03fcf13b6c6a83c) |
| Safe withdraw 0.006224 tWBTC | [0xba5c881e…ced0](https://explorer.test.mezo.org/tx/0xba5c881e4f313be9ef2aae7df1dbf24144d86d0e2bcf3f07915609559d12ced0) |
| Open position 2 at max LTV | [0x153418db…d38b](https://explorer.test.mezo.org/tx/0x153418db54c1ec2f0b9b5bea861051cbd8c718f0eab1a0de28b714ee8011d38b) |
| Price drop → HF 0.95 | [0xa1e0f9ce…18d1](https://explorer.test.mezo.org/tx/0xa1e0f9ce1cbd5a253b5c5e73e65924aa6a2c4d8f4d7fa4bbb233c861690e18d1) |
| **Liquidation** (repay 218.48 MUSD, seize 0.003978 tWBTC) | [0x23212465…cac5](https://explorer.test.mezo.org/tx/0x23212465d87a2a7f74f1c137c80642ccb8331b48ac24d047f2474f342f73cac5) |
| Price restored | [0x2fef2d27…a07](https://explorer.test.mezo.org/tx/0x2fef2d27aa51662620ed88096a15c750a80521af352a78932a419239bcb2ea07) |
| Healthy demo position reopened | [0x272ab302…bfdd](https://explorer.test.mezo.org/tx/0x272ab30254a782b4489368148fb37d97d18e5f9abe40518f2ec0ec303b9abfdd) |

Each step asserted on-chain state after it ran. Checks included: debt reduced by exactly the repaid amount, liquidator received the seized collateral, a second liquidation of the same position was impossible, vault balance at least matches accounting, and pool liquidity equals the pool's MUSD balance. Leftover testnet BTC (0.0099999 BTC) was refunded to the funding wallet: [0x08443390…7c77](https://explorer.test.mezo.org/tx/0x08443390cae210a950689a7e2bac563d865f9cc935da938588d93395599b7c77).

## Tests

| Suite | Result |
|---|---|
| Contracts (Solidity + fuzz, node/viem flows) | 108 passing (101 Solidity, 7 node) |
| Backend (API, auth, sessions, indexer) | 29 passing |
| Web (formatters, risk math) | 21 passing |
| Type check, lint, `next build` | Clean |

## Security

- An automated security review (Pashov solidity-auditor, 2 passes) produced 8 findings. The critical ones are fixed, with regression and fuzz tests. Details are in `docs/SECURITY.md`.
  - Liquidating a position that the collateral still covers can no longer write off debt. The seizure is proportional, and the engine refuses the write-off.
  - Only the team can mint the test tokens (MINTER_ROLE).
- Three findings are accepted for the MVP: small caps, and the team is the only liquidity provider.
- This was not a professional audit. The app says so on every page.
- Supabase uses row-level security and wallet-signature sessions. Secrets live only in Vercel env and the gitignored `.env.local`.

## Known limitations

- No interest accrues (0% rate) in this MVP.
- tWBTC and tUSD are test-only assets with admin-set prices. They stay valid for 30 days (until about 12 Dec 2026). After that, a wallet with ORACLE_MANAGER_ROLE must call `setPrice` again. The deployer was refunded, so it needs a little BTC for gas to do this.
- The deployer wallet holds every admin role. There is no multisig or timelock.
- The indexer runs once a day (Vercel Hobby cron limit). The UI reads chain logs directly, so it does not depend on the indexer.
- The contracts are not source-verified on the explorer yet.
- In the demo video, the wallet-signed steps are shown as their explorer transactions, not live UI clicks. The recording could not sign transactions.

## Incomplete criteria

- Explorer source verification (optional).
- Live end-to-end UI transactions with a browser wallet were not recorded. The same steps ran on-chain through the scripts above.
