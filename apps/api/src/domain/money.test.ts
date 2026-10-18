import { describe, expect, it } from "vitest";
import { comparePrices, InvalidPriceError, parsePrice } from "./money.js";

describe("parsePrice", () => {
  it("rejects invalid prices", () => {
    for (const value of ["", "abc", "-1", "0", "0.0", "01.2", "1.123456789", "1.", ".5", "NaN"]) {
      expect(() => parsePrice(value)).toThrow(InvalidPriceError);
    }
  });

  it("treats equivalent decimal strings as the same amount", () => {
    expect(parsePrice("70000.10")).toBe(parsePrice("70000.10000000"));
    expect(comparePrices("70000.5", "70000.50")).toBe(0);
  });
});

describe("comparePrices", () => {
  it("orders decimal prices without using floating point", () => {
    expect(comparePrices("70000.01", "70000.02")).toBe(-1);
    expect(comparePrices("70000.02", "70000.01")).toBe(1);
  });
});
