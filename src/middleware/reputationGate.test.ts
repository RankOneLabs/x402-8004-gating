import { describe, it, expect, vi } from "vitest";
import { validateReputation } from "./reputationGate.js";
import type { ReputationProvider } from "../erc8004/types.js";
import type { ReputationConfig } from "./types.js";
import { isOk, isErr } from "../types/result.js";

const mockProvider = (score: number, feedbackCount = 5): ReputationProvider => ({
  getScore: vi.fn().mockResolvedValue({ score, feedbackCount }),
});

const config: ReputationConfig = { minScore: 50 };

describe("validateReputation", () => {
  it("returns Err(MissingAgentAddress) when address is undefined", async () => {
    const result = await validateReputation(undefined, mockProvider(80), config);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error._tag).toBe("MissingAgentAddress");
  });

  it("returns Err(InvalidAgentAddress) for invalid address format", async () => {
    const result = await validateReputation("not-an-address", mockProvider(80), config);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error._tag).toBe("InvalidAgentAddress");
      if (result.error._tag === "InvalidAgentAddress") {
        expect(result.error.address).toBe("not-an-address");
      }
    }
  });

  it("returns Err(InsufficientReputation) when score is below threshold", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const result = await validateReputation(addr, mockProvider(30), config);
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error._tag).toBe("InsufficientReputation");
      if (result.error._tag === "InsufficientReputation") {
        expect(result.error.score).toBe(30);
        expect(result.error.required).toBe(50);
        expect(result.error.feedbackCount).toBe(5);
      }
    }
  });

  it("returns Ok(score) when score equals the threshold exactly", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const result = await validateReputation(addr, mockProvider(50), config);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(50);
  });

  it("returns Ok(score) when score is above threshold", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const result = await validateReputation(addr, mockProvider(80), config);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(80);
  });

  it("passes tags through to the provider", async () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    const provider = mockProvider(80);
    const tagConfig: ReputationConfig = { minScore: 50, tag1: "api", tag2: "v2" };
    await validateReputation(addr, provider, tagConfig);
    expect(provider.getScore).toHaveBeenCalledWith(addr, "api", "v2");
  });
});
