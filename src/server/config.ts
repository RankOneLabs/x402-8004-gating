import type { GatingRoutesConfig } from "../middleware/types.js";

/**
 * Declarative per-route gating policies.
 *
 * Each key is "METHOD /path" matching the Express route.
 * Each value declares the gating mode and its parameters.
 */
export function buildGatingRoutes(payTo: string, network: string): GatingRoutesConfig {
  return {
    // Pure payment — flat fee, no reputation check
    "GET /api/paid": {
      mode: "payment",
      payment: { basePrice: "$0.001", network, payTo },
      description: "Pay-per-request endpoint",
    },

    // Pure reputation — must meet minimum score, no payment
    "GET /api/trusted": {
      mode: "reputation",
      reputation: { minScore: 50 },
      description: "Reputation-gated endpoint (min score 50)",
    },

    // Combined — reputation score determines discounted price
    "GET /api/flex": {
      mode: "combined",
      payment: { basePrice: "$0.01", network, payTo },
      reputation: { minScore: 0 }, // any score qualifies for lookup
      priceTiers: [
        { minScore: 90, price: "$0.001" }, // 90% discount
        { minScore: 50, price: "$0.005" }, // 50% discount
      ],
      description: "Flexible endpoint — higher reputation means lower price",
    },
  };
}
