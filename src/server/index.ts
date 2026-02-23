import "dotenv/config";
import express from "express";
import { createGatingMiddleware } from "../middleware/gatingMiddleware.js";
import { buildGatingRoutes } from "./config.js";
import { MockERC8004Client } from "../erc8004/mock.js";
import type { ReputationProvider } from "../erc8004/types.js";
import routes from "./routes.js";

const PORT = parseInt(process.env.PORT || "8004", 10);
const MOCK_MODE = process.env.MOCK_MODE === "true";
const LOCAL_MODE = process.env.LOCAL_MODE === "true";
// Default PAY_TO to Anvil account #0 in local mode (valid recipient for USDC transfers)
const PAY_TO = process.env.PAY_TO_ADDRESS ||
  (process.env.LOCAL_MODE === "true"
    ? "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    : "0x0000000000000000000000000000000000000000");
const NETWORK = "eip155:84532"; // Base Sepolia
const FACILITATOR_URL = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";

async function main() {
  // Build reputation provider
  let reputationProvider: ReputationProvider;
  let facilitatorUrl = FACILITATOR_URL;

  if (MOCK_MODE) {
    console.log("[mode] Mock — using mock reputation scores");
    const mock = new MockERC8004Client({
      // Pre-configured mock agents for demo
      "0xHighRepAgent": 95,
      "0xMidRepAgent": 60,
      "0xLowRepAgent": 20,
      "0xNoRepAgent": 0,
    });
    reputationProvider = mock;
  } else {
    const rpcUrl = LOCAL_MODE
      ? (process.env.ANVIL_RPC || "http://127.0.0.1:8545")
      : (process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org");

    const modeLabel = LOCAL_MODE ? "Local (Anvil fork)" : "Live (Base Sepolia)";
    console.log(`[mode] ${modeLabel} — using ERC-8004 contracts via ${rpcUrl}`);

    const { ERC8004Client } = await import("../erc8004/client.js");

    // For local mode, only scan recent blocks to avoid hitting RPC range limits.
    // The seed script creates events near the fork block, so 1000 blocks back is plenty.
    let fromBlock: bigint | undefined;
    if (LOCAL_MODE) {
      const { createPublicClient, http } = await import("viem");
      const { baseSepolia } = await import("viem/chains");
      const pc = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });
      const currentBlock = await pc.getBlockNumber();
      fromBlock = currentBlock - 1000n;
      if (fromBlock < 0n) fromBlock = 0n;
    }

    reputationProvider = new ERC8004Client({
      rpcUrl,
      identityRegistry: process.env.IDENTITY_REGISTRY || "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      reputationRegistry: process.env.REPUTATION_REGISTRY || "0x8004B663056A597Dffe9eCcC1965A193B7388713",
      fromBlock,
    });
  }

  // Build route configs
  const gatingRoutes = buildGatingRoutes(PAY_TO, NETWORK);

  // Create Express app
  const app = express();
  app.use(express.json());

  // ── Embedded facilitator (LOCAL_MODE only) ──
  if (LOCAL_MODE) {
    facilitatorUrl = `http://localhost:${PORT}/facilitator`;

    const { x402Facilitator } = await import("@x402/core/facilitator");
    const { ExactEvmScheme: FacilitatorEvmScheme } = await import("@x402/evm/exact/facilitator");
    const { toFacilitatorEvmSigner } = await import("@x402/evm");
    const { createWalletClient, createPublicClient, http } = await import("viem");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { baseSepolia } = await import("viem/chains");
    const { publicActions } = await import("viem");

    const anvilRpc = process.env.ANVIL_RPC || "http://127.0.0.1:8545";
    const facilitatorKey = process.env.FACILITATOR_PRIVATE_KEY ||
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

    const facilitatorAccount = privateKeyToAccount(facilitatorKey as `0x${string}`);
    const facilitatorClient = createWalletClient({
      account: facilitatorAccount,
      chain: baseSepolia,
      transport: http(anvilRpc),
    }).extend(publicActions);

    // Cast needed: viem's strict TypedData types don't match the library's looser signatures
    const facilitatorSigner = toFacilitatorEvmSigner(facilitatorClient as any);
    const evmScheme = new FacilitatorEvmScheme(facilitatorSigner);
    const facilitator = new x402Facilitator()
      .register("eip155:84532", evmScheme);

    console.log(`[facilitator] Embedded facilitator at ${facilitatorUrl}`);
    console.log(`[facilitator] Signer: ${facilitatorAccount.address}`);

    // POST /facilitator/verify
    app.post("/facilitator/verify", async (req, res) => {
      try {
        const { paymentPayload, paymentRequirements } = req.body;
        const result = await facilitator.verify(paymentPayload, paymentRequirements);
        res.json(result);
      } catch (err) {
        console.error("[facilitator] verify error:", err);
        res.status(500).json({ isValid: false, invalidReason: String(err) });
      }
    });

    // POST /facilitator/settle
    app.post("/facilitator/settle", async (req, res) => {
      try {
        const { paymentPayload, paymentRequirements } = req.body;
        const result = await facilitator.settle(paymentPayload, paymentRequirements);
        res.json(result);
      } catch (err) {
        console.error("[facilitator] settle error:", err);
        res.status(500).json({ success: false, errorReason: String(err), transaction: "", network: "eip155:84532" });
      }
    });

    // GET /facilitator/supported
    app.get("/facilitator/supported", (_req, res) => {
      res.json(facilitator.getSupported());
    });
  }

  // Mount gating middleware
  const middlewares = createGatingMiddleware({
    gatingRoutes,
    reputationProvider,
    mockMode: MOCK_MODE,
    facilitatorUrl,
  });
  for (const mw of middlewares) {
    app.use(mw);
  }

  // Mount route handlers
  app.use(routes);

  app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] Mock mode: ${MOCK_MODE}, Local mode: ${LOCAL_MODE}`);
    console.log("");
    console.log("Routes:");
    for (const [key, config] of Object.entries(gatingRoutes)) {
      console.log(`  ${key} — mode=${config.mode} ${config.description || ""}`);
    }
    if (LOCAL_MODE) {
      console.log("");
      console.log("Facilitator:");
      console.log(`  POST /facilitator/verify`);
      console.log(`  POST /facilitator/settle`);
      console.log(`  GET  /facilitator/supported`);
    }
    console.log("");
    console.log("Try:");
    console.log(`  curl http://localhost:${PORT}/health`);
    console.log(`  curl http://localhost:${PORT}/api/paid`);
    if (LOCAL_MODE) {
      console.log(`  npm run client:local   # full end-to-end with real x402 payments`);
    }
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
