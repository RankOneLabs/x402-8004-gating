/**
 * Seed a local Anvil fork with:
 *   1. Two registered ERC-8004 agent identities (accounts #2, #3)
 *   2. Reputation feedback from accounts #4, #5
 *   3. USDC funding for the client wallet (account #1)
 *
 * Prerequisites: Anvil must be running (`npm run anvil`)
 *
 * Usage: npm run seed:local
 */
import "dotenv/config";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  zeroHash,
  type Address,
  type Transport,
  type Chain,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { identityRegistryAbi, reputationRegistryAbi } from "../src/erc8004/abis.js";
import { type Option, Some, None, isSome, isNone } from "../src/types/option.js";

// ── Anvil default accounts (deterministic from mnemonic) ──
const ANVIL_KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 facilitator
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1 client (payer)
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // #2 agent A (high rep)
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // #3 agent B (mid rep)
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // #4 feedback giver 1
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // #5 feedback giver 2
] as const;

const ANVIL_RPC = process.env.ANVIL_RPC || "http://127.0.0.1:8545";
const IDENTITY_REGISTRY = (process.env.IDENTITY_REGISTRY ||
  "0x8004A818BFB912233c491871b3d84c89A494BD9e") as Address;
const REPUTATION_REGISTRY = (process.env.REPUTATION_REGISTRY ||
  "0x8004B663056A597Dffe9eCcC1965A193B7388713") as Address;

// Base Sepolia USDC
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address;

const erc20Abi = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const transport = http(ANVIL_RPC);

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport,
});

function makeWallet(key: string): WalletClient<Transport, Chain, Account> {
  return createWalletClient({
    account: privateKeyToAccount(key as `0x${string}`),
    chain: baseSepolia,
    transport,
  });
}

async function waitTx(hash: `0x${string}`, label: string) {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  ${label} — block ${receipt.blockNumber} (${receipt.status})`);
  return receipt;
}

async function anvilRpc(method: string, params: unknown[]) {
  const res = await fetch(ANVIL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 }),
  });
  if (!res.ok) {
    throw new Error(`Anvil RPC HTTP error: ${res.status} ${res.statusText}`);
  }
  const json = await res.json() as { result?: unknown; error?: { code: number; message: string } };
  if (json.error) {
    throw new Error(`Anvil RPC error in ${method}: ${json.error.message}`);
  }
  return json.result;
}

// Registered(uint256 indexed agentId, string agentURI, address indexed owner)
const REGISTERED_TOPIC = "0xca52e62c367d81bb2e328eb795f7c7ba24afb478408a26c0e201d155c449bc4a";

function parseAgentId(receipt: { logs: readonly { topics: readonly string[]; address: string }[] }): Option<bigint> {
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === IDENTITY_REGISTRY.toLowerCase() &&
      l.topics[0] === REGISTERED_TOPIC,
  );
  if (log && log.topics[1]) {
    return Some(BigInt(log.topics[1]));
  }
  return None;
}

async function main() {
  console.log("=== Seeding local Anvil fork ===\n");
  console.log(`RPC: ${ANVIL_RPC}`);

  // Verify Anvil is reachable
  try {
    await publicClient.getBlockNumber();
  } catch {
    console.error("Cannot connect to Anvil. Is it running? (`npm run anvil`)");
    process.exit(1);
  }

  const accounts = ANVIL_KEYS.map((k) => privateKeyToAccount(k as `0x${string}`));
  console.log(`Facilitator (account #0): ${accounts[0].address}`);
  console.log(`Client/payer (account #1): ${accounts[1].address}`);
  console.log(`Agent A (account #2): ${accounts[2].address}`);
  console.log(`Agent B (account #3): ${accounts[3].address}`);
  console.log(`Feedback giver 1 (account #4): ${accounts[4].address}`);
  console.log(`Feedback giver 2 (account #5): ${accounts[5].address}`);
  console.log("");

  // ── Step 0: Clear EIP-7702 delegation code from Anvil accounts ──
  // On Base Sepolia, these well-known addresses have delegation designators,
  // which causes _safeMint's onERC721Received callback to fail.
  console.log("0. Clearing EIP-7702 delegation code from Anvil accounts...");
  for (const acct of accounts) {
    await anvilRpc("anvil_setCode", [acct.address, "0x"]);
  }
  console.log("  Done — all accounts are now plain EOAs\n");

  // ── Step 1: Register agent identities ──
  console.log("1. Registering agent identities...");

  const agentAWallet = makeWallet(ANVIL_KEYS[2]);
  const agentBWallet = makeWallet(ANVIL_KEYS[3]);

  const hashA = await agentAWallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [],
  });
  const receiptA = await waitTx(hashA, "Agent A registered");
  const parsedA = parseAgentId(receiptA);

  const hashB = await agentBWallet.writeContract({
    address: IDENTITY_REGISTRY,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [],
  });
  const receiptB = await waitTx(hashB, "Agent B registered");
  const parsedB = parseAgentId(receiptB);

  if (isNone(parsedA) || isNone(parsedB)) {
    console.error("Failed to parse agent IDs from registration events");
    process.exit(1);
  }

  const agentIdA = parsedA.value;
  const agentIdB = parsedB.value;

  console.log(`  Agent A id: ${agentIdA}`);
  console.log(`  Agent B id: ${agentIdB}`);

  // ── Step 2: Submit reputation feedback ──
  console.log("\n2. Submitting reputation feedback...");

  const fb1Wallet = makeWallet(ANVIL_KEYS[4]);
  const fb2Wallet = makeWallet(ANVIL_KEYS[5]);

  // Agent A gets high scores (90, 95) → avg ~92
  const fbA1 = await fb1Wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [agentIdA, 90n, 0, "quality", "", "http://localhost:8004/api/flex", "", zeroHash],
  });
  await waitTx(fbA1, "Feedback for Agent A from #4 (score=90)");

  const fbA2 = await fb2Wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [agentIdA, 95n, 0, "quality", "", "http://localhost:8004/api/flex", "", zeroHash],
  });
  await waitTx(fbA2, "Feedback for Agent A from #5 (score=95)");

  // Agent B gets medium scores (55, 65) → avg ~60
  const fbB1 = await fb1Wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [agentIdB, 55n, 0, "quality", "", "http://localhost:8004/api/flex", "", zeroHash],
  });
  await waitTx(fbB1, "Feedback for Agent B from #4 (score=55)");

  const fbB2 = await fb2Wallet.writeContract({
    address: REPUTATION_REGISTRY,
    abi: reputationRegistryAbi,
    functionName: "giveFeedback",
    args: [agentIdB, 65n, 0, "quality", "", "http://localhost:8004/api/flex", "", zeroHash],
  });
  await waitTx(fbB2, "Feedback for Agent B from #5 (score=65)");

  // ── Step 3: Fund client wallet with USDC ──
  console.log("\n3. Funding client wallet with USDC...");

  const clientAddress = accounts[1].address;
  const usdcAmount = parseUnits("100", 6); // 100 USDC

  // Find a USDC holder to impersonate. We'll use the USDC contract's own address
  // or the facilitator account. On a fork, we can mint by impersonating the master minter,
  // but the simplest approach: impersonate a known holder.
  // Use account #0 (facilitator) — we'll first send USDC to it via impersonation of a whale.
  // On Base Sepolia forks, the faucet address often holds USDC. Let's try a direct approach:
  // impersonate the USDC contract itself won't work for transfer. Instead we'll use
  // anvil_setBalance style: impersonate a known USDC holder.

  // Strategy: Use anvil_setStorageAt to directly set the USDC balance for the client.
  // USDC (proxy) balanceOf mapping is at slot 9 for Circle's FiatTokenV2.
  // balances mapping slot for address = keccak256(abi.encode(address, 9))
  const { keccak256, encodePacked, pad, toHex, numberToHex } = await import("viem");

  // For USDC proxy on Base Sepolia — balances are at slot 9
  // slot = keccak256(abi.encodePacked(bytes32(address), bytes32(uint256(9))))
  const paddedAddr = pad(clientAddress as `0x${string}`, { size: 32 });
  const paddedSlot = pad(numberToHex(9), { size: 32 });
  const storageSlot = keccak256(encodePacked(["bytes32", "bytes32"], [paddedAddr, paddedSlot]));

  // Set balance to 100 USDC (100 * 10^6 = 100000000)
  const balanceHex = pad(toHex(usdcAmount), { size: 32 });

  await anvilRpc("anvil_setStorageAt", [USDC_ADDRESS, storageSlot, balanceHex]);

  // Verify
  const balance = await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [clientAddress],
  });
  console.log(`  Client USDC balance: ${Number(balance) / 1e6} USDC`);

  // ── Summary ──
  console.log("\n=== Seed complete ===\n");
  console.log("Agent addresses for testing:");
  console.log(`  High rep (Agent A): ${accounts[2].address}`);
  console.log(`  Mid rep  (Agent B): ${accounts[3].address}`);
  console.log("");
  console.log("Next steps:");
  console.log("  npm run dev:local     # start server");
  console.log("  npm run client:local  # run client demo");
  console.log("");
  console.log("Manual curl tests:");
  console.log(`  curl -H "X-Agent-Address: ${accounts[2].address}" http://localhost:8004/api/trusted`);
  console.log(`  curl -H "X-Agent-Address: ${accounts[3].address}" http://localhost:8004/api/trusted`);
}

main().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
