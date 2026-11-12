-- Mosaic Vault — collateral_assets seed for Mezo Testnet (chain 31611)
-- Addresses must be LOWERCASE (check constraint). Re-runnable (upsert on chain_id + token_address).
--
-- Fill the two placeholder token/oracle addresses from contracts/deployments/mezo-testnet.json
-- after deployment (tokens.tWBTC, tokens.tUSD, contracts.TestPriceOracle), then run this file.

insert into mosaic.collateral_assets
  (chain_id, token_address, symbol, name, decimals, asset_type, oracle_address, verification_status, notes)
values
  -- BTC: Mezo's native-BTC ERC-20 precompile (verified on-chain 2026-11-06). Oracle = ChainlinkFeedOracleAdapter
  -- over the BTC/USD precompile 0x7b7c…0015; set oracle_address to contracts.ChainlinkFeedOracleAdapter after deploy.
  (31611, '0x7b7c000000000000000000000000000000000000', 'BTC', 'BTC (Mezo precompile)', 18,
   'verified_external', null, 'verified',
   'Real Mezo testnet BTC. Price from the BTC/USD oracle precompile 0x7b7c000000000000000000000000000000000015 via ChainlinkFeedOracleAdapter. Max staleness 900s.'),

  -- tWBTC: TestCollateralToken (8 decimals, MINTER_ROLE mint). REPLACE token_address with tokens.tWBTC from the deployment JSON.
  -- ('0xe06f05d2cd5ea884c28ebb5ce8887a4924e4d8fd' is a placeholder so the row can be inserted before deployment.)
  (31611, '0xe06f05d2cd5ea884c28ebb5ce8887a4924e4d8fd', 'tWBTC', 'Mosaic Test Wrapped BTC (test-only)', 8,
   'test_only', null, 'test_only',
   'TEST-ONLY TOKEN: no value, minted by the team. Price set by TestPriceOracle (admin-set, seeded from live BTC price). Never real WBTC.'),

  -- tUSD: TestCollateralToken (6 decimals, MINTER_ROLE mint). REPLACE token_address with tokens.tUSD from the deployment JSON.
  (31611, '0xc4468792ee9bfecae8603559c485a212aee86ff1', 'tUSD', 'Mosaic Test Stablecoin (test-only)', 6,
   'test_only', null, 'test_only',
   'TEST-ONLY TOKEN: no value, minted by the team. Price fixed at 1.00 by TestPriceOracle (admin-set).'),

  -- Tokenized RWA: listed as unsupported in the UI. Placeholder address; never registered on-chain.
  (31611, '0x00000000000000000000000000000000000000ff', 'RWA', 'Tokenized RWA (not enabled)', null,
   'unsupported', null, 'unverified',
   'Not enabled. Requires oracle, custody and legal review before it can be listed as collateral.')
on conflict (chain_id, token_address) do update set
  symbol              = excluded.symbol,
  name                = excluded.name,
  decimals            = excluded.decimals,
  asset_type          = excluded.asset_type,
  oracle_address      = excluded.oracle_address,
  verification_status = excluded.verification_status,
  notes               = excluded.notes;

-- After deployment, point the rows at the real addresses, e.g.:
-- update mosaic.collateral_assets set token_address = lower('<tokens.tWBTC>'), oracle_address = lower('<contracts.TestPriceOracle>')
--   where chain_id = 31611 and symbol = 'tWBTC';
-- update mosaic.collateral_assets set token_address = lower('<tokens.tUSD>'),  oracle_address = lower('<contracts.TestPriceOracle>')
--   where chain_id = 31611 and symbol = 'tUSD';
-- update mosaic.collateral_assets set oracle_address = lower('<contracts.ChainlinkFeedOracleAdapter>')
--   where chain_id = 31611 and symbol = 'BTC';
