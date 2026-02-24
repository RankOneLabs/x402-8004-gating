/**
 * Helper: prints instructions for funding a wallet with testnet ETH and USDC
 * on Base Sepolia for use with x402.
 *
 * Usage: npm run fund-wallet
 */
import "dotenv/config";
import { privateKeyToAccount } from "viem/accounts";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

function main() {
  console.log("=== Funding your Base Sepolia wallet ===\n");

  if (PRIVATE_KEY) {
    const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
    console.log(`Your wallet address: ${account.address}\n`);
  } else {
    console.log("(Set PRIVATE_KEY in .env to see your address)\n");
  }

  console.log("Step 1: Get Base Sepolia ETH (for gas)");
  console.log("  - Coinbase Faucet: https://portal.cdp.coinbase.com/products/faucet");
  console.log("  - Alchemy Faucet:  https://www.alchemy.com/faucets/base-sepolia");
  console.log("");

  console.log("Step 2: Get testnet USDC on Base Sepolia");
  console.log("  USDC contract: 0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  console.log("  - Circle Faucet:   https://faucet.circle.com/");
  console.log("    Select 'Base Sepolia' and paste your address.");
  console.log("");

  console.log("Step 3: Verify balances");
  console.log(
    "  Check on BaseScan: https://sepolia.basescan.org/address/<your-address>",
  );
  console.log("");

  console.log("Once funded, you can run:");
  console.log("  npm run dev          # start server in live mode");
  console.log("  npm run client       # run client demo");
  console.log("  npm run register-agent  # register ERC-8004 identity");
}

main();
