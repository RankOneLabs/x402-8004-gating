import { describe, it, expect, vi } from "vitest";
import { checkReputation } from "./reputationGate.js";
import type { ReputationProvider } from "../erc8004/types.js";
import type { ReputationConfig } from "./types.js";

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

function mockReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function mockProvider(score: number, feedbackCount = 5): ReputationProvider {
  return {
    getScore: vi.fn().mockResolvedValue({ score, feedbackCount }),
  };
}

const config: ReputationConfig = { minScore: 50 };

describe("checkReputation", () => {
  it("returns null and sends 403 when X-Agent-Address header is missing", async () => {
    const req = mockReq({});
    const res = mockRes();
    const result = await checkReputation(req, res, mockProvider(80), config);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/Missing/);
  });

  it("returns null and sends 400 for invalid address format", async () => {
    const req = mockReq({ "x-agent-address": "not-an-address" });
    const res = mockRes();
    const result = await checkReputation(req, res, mockProvider(80), config);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid/);
  });

  it("returns null and sends 403 when score is below threshold", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const req = mockReq({ "x-agent-address": addr });
    const res = mockRes();
    const result = await checkReputation(req, res, mockProvider(30), config);
    expect(result).toBeNull();
    expect(res.statusCode).toBe(403);
    expect(res.body.score).toBe(30);
    expect(res.body.required).toBe(50);
  });

  it("returns score when score equals the threshold exactly", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const req = mockReq({ "x-agent-address": addr });
    const res = mockRes();
    const result = await checkReputation(req, res, mockProvider(50), config);
    expect(result).toBe(50);
  });

  it("returns score when score is above threshold", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const req = mockReq({ "x-agent-address": addr });
    const res = mockRes();
    const result = await checkReputation(req, res, mockProvider(80), config);
    expect(result).toBe(80);
  });

  it("passes tags through to the provider", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const req = mockReq({ "x-agent-address": addr });
    const res = mockRes();
    const provider = mockProvider(80);
    const tagConfig: ReputationConfig = { minScore: 50, tag1: "api", tag2: "v2" };
    await checkReputation(req, res, provider, tagConfig);
    expect(provider.getScore).toHaveBeenCalledWith(addr, "api", "v2");
  });
});
