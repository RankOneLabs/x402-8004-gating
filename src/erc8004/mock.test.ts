import { describe, it, expect } from "vitest";
import { MockERC8004Client } from "./mock.js";

describe("MockERC8004Client", () => {
  it("returns initial scores", async () => {
    const client = new MockERC8004Client({ "0xABCD": 75 });
    const result = await client.getScore("0xABCD");
    expect(result.score).toBe(75);
    expect(result.feedbackCount).toBe(5);
  });

  it("returns score 0 for unknown addresses", async () => {
    const client = new MockERC8004Client();
    const result = await client.getScore("0x1234");
    expect(result.score).toBe(0);
    expect(result.feedbackCount).toBe(0);
  });

  it("looks up addresses case-insensitively", async () => {
    const client = new MockERC8004Client({ "0xABCD": 80 });
    const result = await client.getScore("0xabcd");
    expect(result.score).toBe(80);
  });

  it("clamps scores above 100 to 100", async () => {
    const client = new MockERC8004Client({ "0xABCD": 150 });
    const result = await client.getScore("0xABCD");
    expect(result.score).toBe(100);
  });

  it("clamps scores below 0 to 0", async () => {
    const client = new MockERC8004Client({ "0xABCD": -10 });
    const result = await client.getScore("0xABCD");
    expect(result.score).toBe(0);
  });

  it("setScore updates existing entry", async () => {
    const client = new MockERC8004Client({ "0xABCD": 50 });
    client.setScore("0xABCD", 99);
    const result = await client.getScore("0xABCD");
    expect(result.score).toBe(99);
  });

  it("setScore adds new entry", async () => {
    const client = new MockERC8004Client();
    client.setScore("0xNEW", 42);
    const result = await client.getScore("0xNEW");
    expect(result.score).toBe(42);
  });

  it("setScore clamps values", async () => {
    const client = new MockERC8004Client();
    client.setScore("0xA", 200);
    client.setScore("0xB", -5);
    expect((await client.getScore("0xA")).score).toBe(100);
    expect((await client.getScore("0xB")).score).toBe(0);
  });

  it("accepts tag parameters without error", async () => {
    const client = new MockERC8004Client({ "0xABCD": 60 });
    const result = await client.getScore("0xABCD", "tag1", "tag2");
    expect(result.score).toBe(60);
  });
});
