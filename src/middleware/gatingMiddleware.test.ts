import { describe, it, expect, vi } from "vitest";
import { matchRoute, createGatingMiddleware } from "./gatingMiddleware.js";
import type { GatingRoutesConfig } from "./types.js";
import { MockERC8004Client } from "../erc8004/mock.js";

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
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("payment");
  });

  it("returns null for non-matching path", () => {
    expect(matchRoute(fakeReq("GET", "/api/unknown"), routes)).toBeNull();
  });

  it("returns null for wrong method", () => {
    expect(matchRoute(fakeReq("POST", "/api/paid"), routes)).toBeNull();
  });

  it("matches wildcard route", () => {
    const result = matchRoute(fakeReq("GET", "/api/premium/foo"), routes);
    expect(result).not.toBeNull();
    expect(result!.mode).toBe("payment");
  });

  it("wildcard matches exact prefix path", () => {
    const result = matchRoute(fakeReq("GET", "/api/premium"), routes);
    expect(result).not.toBeNull();
  });

  it("wildcard does not match partial prefix", () => {
    expect(matchRoute(fakeReq("GET", "/api/premiumbar"), routes)).toBeNull();
  });

  it("skips invalid patterns (no space)", () => {
    const badRoutes: GatingRoutesConfig = {
      "/no-method": { mode: "payment" },
    };
    expect(matchRoute(fakeReq("GET", "/no-method"), badRoutes)).toBeNull();
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
