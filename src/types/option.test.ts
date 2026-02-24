import { describe, it, expect } from "vitest";
import { Some, None, isSome, isNone, map, flatMap, getOrElse } from "./option.js";

describe("Option", () => {
  describe("constructors", () => {
    it("Some wraps a value", () => {
      const opt = Some(42);
      expect(opt).toEqual({ _tag: "Some", value: 42 });
    });

    it("None is a singleton", () => {
      expect(None).toEqual({ _tag: "None" });
    });
  });

  describe("type guards", () => {
    it("isSome returns true for Some", () => {
      expect(isSome(Some(1))).toBe(true);
    });

    it("isSome returns false for None", () => {
      expect(isSome(None)).toBe(false);
    });

    it("isNone returns true for None", () => {
      expect(isNone(None)).toBe(true);
    });

    it("isNone returns false for Some", () => {
      expect(isNone(Some(1))).toBe(false);
    });
  });

  describe("map", () => {
    it("transforms the value inside Some", () => {
      const result = map((x: number) => x * 2)(Some(5));
      expect(result).toEqual(Some(10));
    });

    it("passes None through unchanged", () => {
      const result = map((x: number) => x * 2)(None);
      expect(result).toBe(None);
    });
  });

  describe("flatMap", () => {
    const safeDivide = (n: number) =>
      n === 0 ? None : Some(100 / n);

    it("chains Some → Some", () => {
      const result = flatMap(safeDivide)(Some(5));
      expect(result).toEqual(Some(20));
    });

    it("chains Some → None", () => {
      const result = flatMap(safeDivide)(Some(0));
      expect(result).toBe(None);
    });

    it("passes None through without calling f", () => {
      const result = flatMap(safeDivide)(None);
      expect(result).toBe(None);
    });
  });

  describe("getOrElse", () => {
    it("returns the value for Some", () => {
      expect(getOrElse(0)(Some(42))).toBe(42);
    });

    it("returns the fallback for None", () => {
      expect(getOrElse(0)(None)).toBe(0);
    });
  });
});
