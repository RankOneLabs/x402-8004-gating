import { describe, it, expect } from "vitest";
import { buildGatingRoutes } from "./config.js";

describe("buildGatingRoutes", () => {
  const payTo = "0xTEST";
  const network = "eip155:84532";
  const routes = buildGatingRoutes(payTo, network);

  it("returns all three expected routes", () => {
    const keys = Object.keys(routes);
    expect(keys).toContain("GET /api/paid");
    expect(keys).toContain("GET /api/trusted");
    expect(keys).toContain("GET /api/flex");
    expect(keys).toHaveLength(3);
  });

  it("payment route has correct mode and price", () => {
    const route = routes["GET /api/paid"];
    expect(route.mode).toBe("payment");
    expect(route.payment!.basePrice).toBe("$0.001");
  });

  it("reputation route has correct minScore", () => {
    const route = routes["GET /api/trusted"];
    expect(route.mode).toBe("reputation");
    expect(route.reputation!.minScore).toBe(50);
  });

  it("combined route has correct tiers sorted descending", () => {
    const route = routes["GET /api/flex"];
    expect(route.mode).toBe("combined");
    expect(route.priceTiers).toHaveLength(2);
    expect(route.priceTiers![0].minScore).toBeGreaterThan(route.priceTiers![1].minScore);
  });

  it("propagates payTo and network correctly", () => {
    for (const [_key, route] of Object.entries(routes)) {
      if (route.payment) {
        expect(route.payment.payTo).toBe(payTo);
        expect(route.payment.network).toBe(network);
      }
    }
  });
});
