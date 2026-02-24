/**
 * Register an ERC-8004 identity on Base Sepolia.
 * Mints an identity NFT for the wallet derived from PRIVATE_KEY.
 *
 * Usage: npm run register-agent
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { identityRegistryAbi } from "../src/erc8004/abis.js";

const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("Set PRIVATE_KEY in .env");
  process.exit(1);
}

const IDENTITY_REGISTRY = (process.env.IDENTITY_REGISTRY ||
  "0x8004A818BFB912233c491871b3d84c89A494BD9e") as Address;
const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";

async function main() {
  const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
  console.log(`Registering agent for wallet: ${account.address}`);

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });

  // Check if already registered
  const balance = await publicClient.readContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "balanceOf",
    args: [account.address],
  });

  if (balance > 0n) {
    console.log(`Already registered (owns ${balance} identity token(s))`);
    console.log("Use query-reputation to check your score.");
    return;
  }

  // Register (no URI)
  const hash = await walletClient.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [],
  });

  console.log(`Transaction submitted: ${hash}`);
  console.log("Waiting for confirmation...");

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Confirmed in block ${receipt.blockNumber}`);

  // Parse Registered event to get agentId
  const registeredLog = receipt.logs.find(
    (log) => log.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase(),
  );
  if (registeredLog && registeredLog.topics[1]) {
    const agentId = BigInt(registeredLog.topics[1]);
    console.log(`Agent ID: ${agentId}`);
  }

  console.log("Done! Your agent identity is now onchain.");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
