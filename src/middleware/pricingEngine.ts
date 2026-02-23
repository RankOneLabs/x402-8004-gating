import type { PriceTier } from "./types.js";

/**
 * Compute the discounted price based on reputation score and tier config.
 *
 * Tiers should be sorted highest-minScore-first. The first tier whose
 * minScore <= the agent's score determines the price. If no tier matches,
 * falls back to basePrice.
 */
export function computePrice(
  score: number,
  basePrice: string,
  tiers?: PriceTier[],
): string {
  if (!tiers || tiers.length === 0) {
    return basePrice;
  }

  // Tiers are expected sorted descending by minScore
  for (const tier of tiers) {
    if (score >= tier.minScore) {
      return tier.price;
    }
  }

  return basePrice;
}
