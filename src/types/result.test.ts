import { describe, it, expect } from "vitest";
import { Ok, Err, isOk, isErr, map, mapErr, flatMap } from "./result.js";

describe("Result", () => {
  describe("constructors", () => {
    it("Ok wraps a value", () => {
      expect(Ok(42)).toEqual({ _tag: "Ok", value: 42 });
    });

    it("Err wraps an error", () => {
      expect(Err("fail")).toEqual({ _tag: "Err", error: "fail" });
    });
  });

  describe("type guards", () => {
    it("isOk returns true for Ok", () => {
      expect(isOk(Ok(1))).toBe(true);
    });

    it("isOk returns false for Err", () => {
      expect(isOk(Err("x"))).toBe(false);
    });

    it("isErr returns true for Err", () => {
      expect(isErr(Err("x"))).toBe(true);
    });

    it("isErr returns false for Ok", () => {
      expect(isErr(Ok(1))).toBe(false);
    });
  });

  describe("map", () => {
    it("transforms the value inside Ok", () => {
      const result = map((x: number) => x + 1)(Ok(5));
      expect(result).toEqual(Ok(6));
    });

    it("passes Err through unchanged", () => {
      const err = Err("boom");
      const result = map((x: number) => x + 1)(err);
      expect(result).toBe(err);
    });
  });

  describe("mapErr", () => {
    it("transforms the error inside Err", () => {
      const result = mapErr((e: string) => e.toUpperCase())(Err("boom"));
      expect(result).toEqual(Err("BOOM"));
    });

    it("passes Ok through unchanged", () => {
      const ok = Ok(42);
      const result = mapErr((e: string) => e.toUpperCase())(ok);
      expect(result).toBe(ok);
    });
  });

  describe("flatMap", () => {
    const safeSqrt = (n: number) =>
      n < 0 ? Err("negative" as const) : Ok(Math.sqrt(n));

    it("chains Ok → Ok", () => {
      const result = flatMap(safeSqrt)(Ok(9));
      expect(result).toEqual(Ok(3));
    });

    it("chains Ok → Err", () => {
      const result = flatMap(safeSqrt)(Ok(-1));
      expect(result).toEqual(Err("negative"));
    });

    it("passes Err through without calling f", () => {
      const err = Err("negative" as const);
      const result = flatMap(safeSqrt)(err);
      expect(result).toBe(err);
    });
  });
});
