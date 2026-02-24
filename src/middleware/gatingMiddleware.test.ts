import { describe, it, expect, vi } from "vitest";
import { matchRoute, createGatingMiddleware, parseRoutePattern, resolvePrice, isPaymentRoute } from "./gatingMiddleware.js";
import type { GatingRoutesConfig, GatingRouteConfig } from "./types.js";
import { MockERC8004Client } from "../erc8004/mock.js";
import { isSome, isNone, None } from "../types/option.js";
import { isOk, isErr } from "../types/result.js";

// --- parseRoutePattern tests ---

describe("parseRoutePattern", () => {
  it("parses a valid exact pattern", () => {
    const result = parseRoutePattern("GET /api/paid");
    expect(isSome(result)).toBe(true);
    if (isSome(result)) {
      expect(result.value).toEqual({ method: "GET", path: "/api/paid", isWildcard: false });
    }
  });

  it("parses a valid wildcard pattern", () => {
    const result = parseRoutePattern("POST /api/premium/*");
    expect(isSome(result)).toBe(true);
    if (isSome(result)) {
      expect(result.value).toEqual({ method: "POST", path: "/api/premium", isWildcard: true });
    }
  });

  it("returns None for missing method (no space)", () => {
    expect(parseRoutePattern("/no-method")).toBe(None);
  });

  it("returns None for empty string", () => {
    expect(parseRoutePattern("")).toBe(None);
  });
});

// --- resolvePrice tests ---

describe("resolvePrice", () => {
  const baseConfig: GatingRouteConfig = {
    mode: "payment",
    payment: { basePrice: "$0.01", network: "eip155:84532", payTo: "0xPAY" },
  };

  const combinedConfig: GatingRouteConfig = {
    mode: "combined",
    payment: { basePrice: "$0.01", network: "eip155:84532", payTo: "0xPAY" },
    reputation: { minScore: 50, tag1: "quality", tag2: "speed" },
    priceTiers: [
      { minScore: 80, price: "$0.002" },
      { minScore: 50, price: "$0.005" },
    ],
  };

  it("returns Ok(basePrice) for payment mode", async () => {
    const provider = new MockERC8004Client();
    const result = await resolvePrice("0xAGENT", baseConfig, provider);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("$0.01");
  });

  it("returns Ok(basePrice) when no agent address", async () => {
    const provider = new MockERC8004Client();
    const result = await resolvePrice(undefined, combinedConfig, provider);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("$0.01");
  });

  it("returns Ok(discounted price) for combined mode with high score", async () => {
    const provider = new MockERC8004Client({ "0xagent": 85 });
    const result = await resolvePrice("0xAGENT", combinedConfig, provider);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe("$0.002");
  });

  it("returns Err(ReputationFetchFailed) when provider throws", async () => {
    const provider: any = {
      getScore: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const result = await resolvePrice("0xAGENT", combinedConfig, provider);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error._tag).toBe("ReputationFetchFailed");
      expect(result.error.agentAddress).toBe("0xAGENT");
    }
  });

  it("passes reputation tags through to the provider", async () => {
    const provider = new MockERC8004Client({ "0xagent": 60 });
    const spy = vi.spyOn(provider, "getScore");
    await resolvePrice("0xAGENT", combinedConfig, provider);
    expect(spy).toHaveBeenCalledWith("0xAGENT", "quality", "speed");
    spy.mockRestore();
  });
});

// --- isPaymentRoute tests ---

describe("isPaymentRoute", () => {
  it("returns true for payment mode with payment config", () => {
    const entry: [string, GatingRouteConfig] = [
      "GET /pay",
      { mode: "payment", payment: { basePrice: "$0.01", network: "eip155:84532", payTo: "0xPAY" } },
    ];
    expect(isPaymentRoute(entry)).toBe(true);
  });

  it("returns true for combined mode with payment config", () => {
    const entry: [string, GatingRouteConfig] = [
      "GET /combo",
      { mode: "combined", payment: { basePrice: "$0.01", network: "eip155:84532", payTo: "0xPAY" }, reputation: { minScore: 50 } },
    ];
    expect(isPaymentRoute(entry)).toBe(true);
  });

  it("returns false for reputation mode", () => {
    const entry: [string, GatingRouteConfig] = [
      "GET /rep",
      { mode: "reputation", reputation: { minScore: 50 } },
    ];
    expect(isPaymentRoute(entry)).toBe(false);
  });

  it("returns false when payment config is missing", () => {
    const entry: [string, GatingRouteConfig] = [
      "GET /broken",
      { mode: "payment" },
    ];
    expect(isPaymentRoute(entry)).toBe(false);
  });
});

// --- matchRoute tests ---

const routes: GatingRoutesConfig = {
  "GET /api/paid": {
    mode: "payment",
    payment: { basePrice: "$0.001", network: "eip155:84532", payTo: "0xPAY" },
  },
  "GET /api/premium/*": {
    mode: "payment",
    payment: { basePrice: "$0.01", network: "eip155:84532", payTo: "0xPAY" },
  },
  "GET /api/trusted": {
    mode: "reputation",
    reputation: { minScore: 50 },
  },
};

function fakeReq(method: string, path: string) {
  return { method, path } as any;
}

describe("matchRoute", () => {
  it("matches exact route", () => {
    const result = matchRoute(fakeReq("GET", "/api/paid"), routes);
    expect(isSome(result)).toBe(true);
    if (isSome(result)) expect(result.value.mode).toBe("payment");
  });

  it("returns None for non-matching path", () => {
    expect(matchRoute(fakeReq("GET", "/api/unknown"), routes)).toBe(None);
  });

  it("returns None for wrong method", () => {
    expect(matchRoute(fakeReq("POST", "/api/paid"), routes)).toBe(None);
  });

  it("matches wildcard route", () => {
    const result = matchRoute(fakeReq("GET", "/api/premium/foo"), routes);
    expect(isSome(result)).toBe(true);
    if (isSome(result)) expect(result.value.mode).toBe("payment");
  });

  it("wildcard matches exact prefix path", () => {
    const result = matchRoute(fakeReq("GET", "/api/premium"), routes);
    expect(isSome(result)).toBe(true);
  });

  it("wildcard does not match partial prefix", () => {
    expect(matchRoute(fakeReq("GET", "/api/premiumbar"), routes)).toBe(None);
  });

  it("skips invalid patterns (no space)", () => {
    const badRoutes: GatingRoutesConfig = {
      "/no-method": { mode: "payment" },
    };
    expect(matchRoute(fakeReq("GET", "/no-method"), badRoutes)).toBe(None);
  });
});

// --- createGatingMiddleware mock mode tests ---

describe("createGatingMiddleware (mock mode)", () => {
  const paymentRoutes: GatingRoutesConfig = {
    "GET /api/paid": {
      mode: "payment",
      payment: { basePrice: "$0.001", network: "eip155:84532", payTo: "0xPAY" },
      description: "Paid endpoint",
    },
    "GET /api/trusted": {
      mode: "reputation",
      reputation: { minScore: 50 },
      description: "Trusted endpoint",
    },
  };

  const mockProvider = new MockERC8004Client();

  function createMiddleware() {
    return createGatingMiddleware({
      gatingRoutes: paymentRoutes,
      reputationProvider: mockProvider,
      mockMode: true,
    });
  }

  function mockRes() {
    const res: any = {
      statusCode: 0,
      body: null,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(data: any) {
        res.body = data;
        return res;
      },
    };
    return res;
  }

  it("returns 402 for payment route without payment header", async () => {
    const [reputationMw, paymentMw] = createMiddleware();
    const req = { method: "GET", path: "/api/paid", headers: {} } as any;
    const res = mockRes();
    const next = vi.fn();

    // Run reputation middleware first (should pass through)
    await reputationMw(req, res, next);
    expect(next).toHaveBeenCalled();

    // Run payment middleware
    const next2 = vi.fn();
    await paymentMw(req, res, next2);
    expect(res.statusCode).toBe(402);
    expect(next2).not.toHaveBeenCalled();
  });

  it("passes through payment route with X-Payment-Mock header", async () => {
    const [_reputationMw, paymentMw] = createMiddleware();
    const req = {
      method: "GET",
      path: "/api/paid",
      headers: { "x-payment-mock": "true" },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await paymentMw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("reputation route passes through payment middleware", async () => {
    const [_reputationMw, paymentMw] = createMiddleware();
    const req = {
      method: "GET",
      path: "/api/trusted",
      headers: {},
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await paymentMw(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("non-gated route passes through both middlewares", async () => {
    const [reputationMw, paymentMw] = createMiddleware();
    const req = {
      method: "GET",
      path: "/api/open",
      headers: {},
    } as any;
    const res = mockRes();
    const next1 = vi.fn();
    const next2 = vi.fn();

    await reputationMw(req, res, next1);
    expect(next1).toHaveBeenCalled();

    await paymentMw(req, res, next2);
    expect(next2).toHaveBeenCalled();
  });
});
