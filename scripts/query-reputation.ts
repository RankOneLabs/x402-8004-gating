/**
 * Query an agent's reputation score from Base Sepolia.
 *
 * Usage: npm run query-reputation -- <agentAddress>
 * Example: npm run query-reputation -- 0x1234...abcd
 */
import "dotenv/config";
import { ERC8004Client } from "../src/erc8004/client.js";
import { isErr, isOk } from "../src/types/result.js";
import { isNone, isSome } from "../src/types/option.js";

const RPC_URL = process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org";
const IDENTITY_REGISTRY =
  process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e";
const REPUTATION_REGISTRY =
  process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713";

async function main() {
  const agentAddress = process.argv[2];
  if (!agentAddress) {
    console.error("Usage: npm run query-reputation -- <agentAddress>");
    process.exit(1);
  }

  const client = new ERC8004Client({
    rpcUrl: RPC_URL,
    identityRegistry: IDENTITY_REGISTRY,
    reputationRegistry: REPUTATION_REGISTRY,
  });

  console.log(`Querying reputation for: ${agentAddress}`);

  // Resolve agentId
  const resolved = await client.resolveAgentId(agentAddress);
  if (isErr(resolved)) {
    console.error(`Invalid address: ${resolved.error.address}`);
    return;
  }
  if (isNone(resolved.value)) {
    console.log("No ERC-8004 identity found for this address.");
    return;
  }
  console.log(`Agent ID: ${resolved.value.value}`);

  // Query score
  const result = await client.getScore(agentAddress);
  console.log(`Score: ${result.score} / 100`);
  console.log(`Feedback count: ${result.feedbackCount}`);
  if (result.raw) {
    console.log(
      `Raw: value=${result.raw.value} decimals=${result.raw.decimals}`,
    );
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
