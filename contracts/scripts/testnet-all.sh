#!/usr/bin/env bash
# One-shot Mezo testnet run. Key is read from the environment only; never written to disk.
#   DEPLOYER_PRIVATE_KEY=0x... REFUND_TO=0x... bash scripts/testnet-all.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY}"
LOG=deployments/testnet-run.log
mkdir -p deployments; : > "$LOG"
run() { echo "=== $1" | tee -a "$LOG"; npx hardhat run "scripts/$1" --network mezoTestnet 2>&1 | tee -a "$LOG"; }
run deploy.ts
FUND_AMOUNT_MUSD="${FUND_AMOUNT_MUSD:-500}" run fund-pool.ts
run btc-check.ts
run demo-flow.ts
run extend-test-prices.ts
if [ -n "${REFUND_TO:-}" ]; then run refund-btc.ts; fi
echo "ALL DONE" | tee -a "$LOG"
