import "dotenv/config";

const BASE_URL = process.env.BASE_URL || "http://localhost:8004";
const MOCK_MODE = process.env.MOCK_MODE === "true";
const LOCAL_MODE = process.env.LOCAL_MODE === "true";

/** Colored output helpers */
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function statusColor(status: number): string {
  if (status >= 200 && status < 300) return green(String(status));
  if (status === 402) return yellow(String(status));
  if (status >= 400) return red(String(status));
  return String(status);
}

async function req(
  fetchFn: typeof fetch,
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  const res = await fetchFn(`${BASE_URL}${path}`, { method, headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function logResult(label: string, status: number, body: unknown) {
  console.log(
    `  ${cyan(label)} ${statusColor(status)} ${dim(JSON.stringify(body, null, 2))}`,
  );
}

/**
 * Build a payment-enabled fetch for local mode.
 * Uses Anvil account #1 as the paying wallet.
 */
async function buildLocalFetch(): Promise<typeof fetch> {
  const { wrapFetchWithPaymentFromConfig } = await import("@x402/fetch");
  const { toClientEvmSigner } = await import("@x402/evm");
  const { ExactEvmScheme } = await import("@x402/evm/exact/client");
  const { privateKeyToAccount } = await import("viem/accounts");
  const { createPublicClient, http } = await import("viem");
  const { baseSepolia } = await import("viem/chains");

  const anvilRpc = process.env.ANVIL_RPC || "http://127.0.0.1:8545";
  // Anvil account #1
  const clientKey = process.env.PRIVATE_KEY ||
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

  const account = privateKeyToAccount(clientKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(anvilRpc),
  });

  const signer = toClientEvmSigner(account, publicClient);
  const evmScheme = new ExactEvmScheme(signer);

  console.log(dim(`  Client wallet: ${account.address}`));
  console.log(dim(`  RPC: ${anvilRpc}\n`));

  return wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: "eip155:84532", client: evmScheme }],
  });
}

async function demo() {
  console.log(cyan("\n=== x402 + ERC-8004 API Access Gating Demo ===\n"));
  console.log(dim(`Target: ${BASE_URL}`));
  const mode = LOCAL_MODE ? "local (Anvil)" : MOCK_MODE ? "mock" : "live";
  console.log(dim(`Mode: ${mode}\n`));

  // Build the fetch function — payment-aware in local mode, plain otherwise
  let fetchFn: typeof fetch = globalThis.fetch;
  if (LOCAL_MODE) {
    console.log(cyan("Setting up x402 payment client..."));
    fetchFn = await buildLocalFetch();
  }

  // ─── Health check ───
  console.log(cyan("1. Health check (no gating)"));
  const health = await req(fetchFn, "GET", "/health");
  logResult("health", health.status, health.body);

  // ─── Payment-only route ───
  console.log(cyan("\n2. Payment-only route: GET /api/paid"));

  if (LOCAL_MODE) {
    console.log("\n  a) Without payment (plain fetch):");
    const paid1 = await req(globalThis.fetch, "GET", "/api/paid");
    logResult("no payment", paid1.status, paid1.body);

    console.log("\n  b) With real x402 payment (auto-sign):");
    const paid2 = await req(fetchFn, "GET", "/api/paid");
    logResult("real payment", paid2.status, paid2.body);
  } else {
    console.log("\n  a) Without payment:");
    const paid1 = await req(fetchFn, "GET", "/api/paid");
    logResult("no payment", paid1.status, paid1.body);

    if (MOCK_MODE) {
      console.log("\n  b) With mock payment:");
      const paid2 = await req(fetchFn, "GET", "/api/paid", { "X-Payment-Mock": "true" });
      logResult("mock payment", paid2.status, paid2.body);
    } else {
      console.log(dim("\n  b) Real payment requires a funded wallet — run `npm run client` for live mode"));
    }
  }

  // ─── Reputation-only route ───
  console.log(cyan("\n3. Reputation-only route: GET /api/trusted (min score: 50)"));

  console.log("\n  a) No agent header:");
  const rep1 = await req(fetchFn, "GET", "/api/trusted");
  logResult("no header", rep1.status, rep1.body);

  if (MOCK_MODE) {
    console.log("\n  b) Low reputation agent (score=20):");
    const rep2 = await req(fetchFn, "GET", "/api/trusted", { "X-Agent-Address": "0xLowRepAgent" });
    logResult("low rep", rep2.status, rep2.body);

    console.log("\n  c) High reputation agent (score=95):");
    const rep3 = await req(fetchFn, "GET", "/api/trusted", { "X-Agent-Address": "0xHighRepAgent" });
    logResult("high rep", rep3.status, rep3.body);
  } else {
    console.log(dim("\n  (Use real registered agent addresses — see seed:local or register-agent)"));
  }

  // ─── Combined route ───
  console.log(cyan("\n4. Combined route: GET /api/flex (reputation -> discounted price)"));
  console.log(dim("   Tiers: score>=90 -> $0.001, score>=50 -> $0.005, else -> $0.01"));

  if (LOCAL_MODE) {
    console.log("\n  a) No reputation (base price $0.01) — auto-pay:");
    const flex1 = await req(fetchFn, "GET", "/api/flex");
    logResult("no rep + paid", flex1.status, flex1.body);
  } else if (MOCK_MODE) {
    console.log("\n  a) No reputation (base price $0.01):");
    const flex1 = await req(fetchFn, "GET", "/api/flex");
    logResult("no rep", flex1.status, flex1.body);

    console.log("\n  b) Mid reputation (score=60, price=$0.005):");
    const flex2 = await req(fetchFn, "GET", "/api/flex", { "X-Agent-Address": "0xMidRepAgent" });
    logResult("mid rep", flex2.status, flex2.body);

    console.log("\n  c) High reputation (score=95, price=$0.001):");
    const flex3 = await req(fetchFn, "GET", "/api/flex", { "X-Agent-Address": "0xHighRepAgent" });
    logResult("high rep", flex3.status, flex3.body);

    console.log("\n  d) High reputation + mock payment:");
    const flex4 = await req(fetchFn, "GET", "/api/flex", {
      "X-Agent-Address": "0xHighRepAgent",
      "X-Payment-Mock": "true",
    });
    logResult("high rep + paid", flex4.status, flex4.body);
  } else {
    console.log("\n  a) No reputation (base price $0.01):");
    const flex1 = await req(fetchFn, "GET", "/api/flex");
    logResult("no rep", flex1.status, flex1.body);

    console.log(dim("\n  (Use real registered agent addresses for reputation-based pricing)"));
  }

  console.log(cyan("\n=== Demo complete ===\n"));
}

demo().catch((err) => {
  console.error("Client error:", err);
  process.exit(1);
});
