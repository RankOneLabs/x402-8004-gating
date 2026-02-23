# gating-x402-8004

API access gating using [x402](https://x402.org) payments and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) onchain reputation. An Express server that gates routes three ways:

- **Payment-only** -- flat fee via x402 (`GET /api/paid`)
- **Reputation-only** -- minimum onchain reputation score (`GET /api/trusted`)
- **Combined** -- reputation score determines a discounted price (`GET /api/flex`)

## Architecture

```
                    ┌──────────────────────────────────────────┐
                    │  Server (Express, port 8004)             │
                    │                                          │
                    │  GET  /api/paid      payment-gated       │
                    │  GET  /api/trusted   reputation-gated    │
                    │  GET  /api/flex      combined             │
                    │  GET  /health        ungated             │
                    │                                          │
                    │  POST /facilitator/verify   ┐            │
                    │  POST /facilitator/settle   ├ local mode │
                    │  GET  /facilitator/supported┘            │
                    └──────────┬───────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                 ▼
     x402 Facilitator   ERC-8004 Contracts   USDC (ERC-20)
     (remote or local)  (IdentityRegistry,   (payment asset)
                         ReputationRegistry)
```

## Modes

| Mode | Reputation | Payments | External deps |
|------|-----------|----------|---------------|
| **Mock** (`MOCK_MODE=true`) | Hardcoded scores | Fake (`X-Payment-Mock` header) | None |
| **Local** (`LOCAL_MODE=true`) | Real contracts on Anvil fork | Real x402 against embedded facilitator | Anvil |
| **Live** (neither flag) | Real contracts on Base Sepolia | Real x402 against remote facilitator | Base Sepolia RPC, funded wallet |

## Quick start

### Prerequisites

- Node.js >= 18
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (for local mode -- provides `anvil`)

### Install

```bash
npm install
cp .env.example .env
```

### Mock mode (no dependencies)

```bash
npm run dev:mock      # start server
npm run client:mock   # run demo client
```

### Local mode (Anvil fork, full end-to-end)

Runs real ERC-8004 contract calls and real x402 payment verify/settle against a local Anvil fork. Zero external dependencies.

```bash
# Terminal 1: start Anvil fork of Base Sepolia
npm run anvil

# Terminal 2: seed contracts + fund wallet
npm run seed:local

# Terminal 2: start server with embedded facilitator
npm run dev:local

# Terminal 3: run client demo (real x402 payments)
npm run client:local
```

The seed script:
- Registers two agent identities (Anvil accounts #2, #3)
- Submits reputation feedback giving Agent A high scores (~92) and Agent B medium scores (~60)
- Funds the client wallet (account #1) with 100 USDC

### Live mode (Base Sepolia)

Requires a funded wallet with Base Sepolia ETH + USDC.

```bash
# Edit .env with your private key and PAY_TO_ADDRESS
npm run dev
npm run client
```

See `npm run fund-wallet` for instructions on getting testnet tokens.

## Routes

### `GET /api/paid` -- payment-only

Flat fee of $0.001 per request. Returns 402 Payment Required if no valid x402 payment is provided.

### `GET /api/trusted` -- reputation-only

Requires `X-Agent-Address` header. The agent must have an ERC-8004 reputation score >= 50. Returns 403 if the agent doesn't meet the threshold.

### `GET /api/flex` -- combined

Reputation score determines the price:

| Score | Price |
|-------|-------|
| >= 90 | $0.001 |
| >= 50 | $0.005 |
| < 50  | $0.01 |

### `GET /health` -- no gating

Always returns `{ "status": "ok" }`.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server (live mode) |
| `npm run dev:mock` | Start server (mock mode) |
| `npm run dev:local` | Start server (local Anvil mode with embedded facilitator) |
| `npm run client` | Run demo client (live) |
| `npm run client:mock` | Run demo client (mock) |
| `npm run client:local` | Run demo client (local, real x402 payments) |
| `npm run anvil` | Start Anvil fork of Base Sepolia on port 8545 |
| `npm run seed:local` | Seed Anvil fork with identities, reputation, and USDC |
| `npm run register-agent` | Register an ERC-8004 identity on Base Sepolia |
| `npm run give-feedback` | Submit reputation feedback on Base Sepolia |
| `npm run query-reputation` | Query an agent's reputation score |
| `npm run fund-wallet` | Print instructions for funding a wallet |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build` | Compile TypeScript |

## Project structure

```
src/
  server/
    index.ts          # Express app, mode selection, embedded facilitator
    config.ts         # Declarative per-route gating policies
    routes.ts         # Route handlers
  client/
    index.ts          # Demo client with mock/local/live modes
  middleware/
    gatingMiddleware.ts  # Unified middleware: reputation gate + x402 payment
    reputationGate.ts    # Reputation threshold check
    pricingEngine.ts     # Score-to-price tier resolution
    types.ts             # GatingRouteConfig, PriceTier, etc.
  erc8004/
    client.ts         # Onchain ERC-8004 reads via viem
    mock.ts           # Mock reputation provider
    abis.ts           # Contract ABIs
    types.ts          # ReputationProvider interface
scripts/
  seed-local.ts       # Seed Anvil fork for local mode
  register-agent.ts   # Register identity on Base Sepolia
  give-feedback.ts    # Submit feedback on Base Sepolia
  query-reputation.ts # Query reputation on Base Sepolia
  fund-wallet.ts      # Wallet funding instructions
```

## Environment variables

See [`.env.example`](.env.example) for all options. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8004` | Server port |
| `MOCK_MODE` | `false` | Use hardcoded mock scores and fake payments |
| `LOCAL_MODE` | `false` | Use Anvil fork with embedded facilitator |
| `ANVIL_RPC` | `http://127.0.0.1:8545` | Anvil RPC URL (local mode) |
| `FACILITATOR_PRIVATE_KEY` | Anvil account #0 | Private key for embedded facilitator signer |
| `PAY_TO_ADDRESS` | `0x0...0` | Address that receives x402 payments |
| `BASE_SEPOLIA_RPC` | `https://sepolia.base.org` | RPC for live mode |
| `X402_FACILITATOR_URL` | `https://x402.org/facilitator` | Remote facilitator (live mode) |

## Contracts (Base Sepolia)

- **IdentityRegistry**: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry**: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
