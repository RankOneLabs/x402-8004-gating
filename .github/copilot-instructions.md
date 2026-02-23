# Copilot Instructions

This is a **demo project** that showcases patterns for integrating [x402](https://x402.org) payments and [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) onchain reputation into an Express API server. It is **not production code**.

## Project purpose

The repository demonstrates three API gating strategies:

- **Payment-only** – flat fee via x402 (`GET /api/paid`)
- **Reputation-only** – minimum onchain reputation score (`GET /api/trusted`)
- **Combined** – reputation score determines a discounted price (`GET /api/flex`)

## Key context for contributors

- Code clarity and illustrative value matter more than production hardening.
- The project runs in three modes: **Mock** (no external deps), **Local** (Anvil fork), and **Live** (Base Sepolia). Keep all three modes working when making changes.
- TypeScript is used throughout (`tsx` for dev, `tsc` for build/typecheck). Run `npm run typecheck` to validate types.
- There are no automated tests; manual verification via the demo client scripts (`npm run client:mock`, `npm run client:local`, `npm run client`) is the primary validation path.
- Avoid adding production-oriented concerns (auth, rate limiting, persistence, etc.) unless they directly serve the demo narrative.
- Contract addresses for Base Sepolia are fixed in the README and in `src/erc8004/client.ts`; do not change them without updating both.
