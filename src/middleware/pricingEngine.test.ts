import { describe, it, expect } from "vitest";
import { computePrice } from "./pricingEngine.js";

describe("computePrice", () => {
  const basePrice = "$0.01";

  it("returns basePrice when no tiers provided", () => {
    expect(computePrice(80, basePrice)).toBe(basePrice);
  });

  it("returns basePrice when tiers is undefined", () => {
    expect(computePrice(80, basePrice, undefined)).toBe(basePrice);
  });

  it("returns basePrice when tiers array is empty", () => {
    expect(computePrice(80, basePrice, [])).toBe(basePrice);
  });

  it("matches highest tier when score qualifies", () => {
    const tiers = [
      { minScore: 90, price: "$0.001" },
      { minScore: 50, price: "$0.005" },
    ];
    expect(computePrice(95, basePrice, tiers)).toBe("$0.001");
  });

  it("picks correct tier when score falls between tiers", () => {
    const tiers = [
      { minScore: 90, price: "$0.001" },
      { minScore: 50, price: "$0.005" },
    ];
    expect(computePrice(70, basePrice, tiers)).toBe("$0.005");
  });

  it("returns basePrice when score is below all tiers", () => {
    const tiers = [
      { minScore: 90, price: "$0.001" },
      { minScore: 50, price: "$0.005" },
    ];
    expect(computePrice(10, basePrice, tiers)).toBe(basePrice);
  });

  it("matches tier at exact boundary (score === minScore)", () => {
    const tiers = [
      { minScore: 90, price: "$0.001" },
      { minScore: 50, price: "$0.005" },
    ];
    expect(computePrice(90, basePrice, tiers)).toBe("$0.001");
    expect(computePrice(50, basePrice, tiers)).toBe("$0.005");
  });

  it("works with a single tier", () => {
    const tiers = [{ minScore: 30, price: "$0.002" }];
    expect(computePrice(30, basePrice, tiers)).toBe("$0.002");
    expect(computePrice(100, basePrice, tiers)).toBe("$0.002");
    expect(computePrice(29, basePrice, tiers)).toBe(basePrice);
  });

  it("sorts tiers internally regardless of input order", () => {
    const tiers = [
      { minScore: 50, price: "$0.005" },
      { minScore: 90, price: "$0.001" },
    ];
    // Score 95 should still match the 90-tier even though it's listed second
    expect(computePrice(95, basePrice, tiers)).toBe("$0.001");
  });
});
