/**
 * Submit reputation feedback for an agent on Base Sepolia.
 *
 * Usage: npm run give-feedback -- <agentId> [score] [tag1] [tag2]
 * Example: npm run give-feedback -- 42 85 quality api-service
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  zeroHash,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { reputationRegistryAbi } from "../src/erc8004/abis.js";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY in .env");
  process.exit(1);
}

const REPUTATION_REGISTRY = (process.env.REPUTATION_REGISTRY ||
  "0x8004B663056A597Dffe9eCcC1965A193B7388713") as Address;
const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";

async function main() {
  const args = process.argv.slice(2);
  const agentId = BigInt(args[0] || "1");
  const score = parseInt(args[1] || "85", 10);
  const tag1 = args[2] || "quality";
  const tag2 = args[3] || "";

  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  console.log(`Submitting feedback from: ${account.address}`);
  console.log(`  Agent ID: ${agentId}`);
  console.log(`  Score: ${score}`);
  console.log(`  Tags: "${tag1}" / "${tag2}"`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  const hash = await walletClient.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [
      agentId,
      BigInt(score), // value (int128)
      0, // valueDecimals (uint8) — integer score
      tag1,
      tag2,
      "https://localhost:8004/api/flex", // endpoint
      "", // feedbackURI
      zeroHash, // feedbackHash
    ],
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Confirmed in block ${receipt.blockNumber}`);
  console.log("Feedback recorded onchain.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
