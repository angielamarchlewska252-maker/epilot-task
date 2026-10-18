import { describe, expect, it } from "vitest";
import { isFreshQuote, isPastDeadline, quoteCoversDeadline, scoreDelta } from "./rules.js";

describe("scoreDelta", () => {
  it("pays +1 when an UP guess sees a higher price", () => {
    expect(scoreDelta("UP", "70000.00", "70000.01")).toBe(1);
  });

  it("charges 1 when an UP guess sees a lower price", () => {
    expect(scoreDelta("UP", "70000.00", "69999.99")).toBe(-1);
  });

  it("pays +1 when a DOWN guess sees a lower price", () => {
    expect(scoreDelta("DOWN", "70000.00", "69999.99")).toBe(1);
  });

  it("charges 1 when a DOWN guess sees a higher price", () => {
    expect(scoreDelta("DOWN", "70000.00", "70010.00")).toBe(-1);
  });

  it("stays pending when the price is unchanged", () => {
    expect(scoreDelta("UP", "70000.10", "70000.10000000")).toBeNull();
    expect(scoreDelta("DOWN", "70000", "70000.0")).toBeNull();
  });
});

describe("deadline rules", () => {
  const created = Date.parse("2026-10-18T12:00:00.000Z");
  const eligible = created + 60_000;

  it("does not allow settlement at 59 seconds", () => {
    expect(isPastDeadline(created + 59_000, eligible)).toBe(false);
  });

  it("allows settlement at exactly 60 seconds", () => {
    expect(isPastDeadline(created + 60_000, eligible)).toBe(true);
  });

  it("requires the trade timestamp to be at or after the deadline", () => {
    const quote = {
      price: "70100",
      observedAt: "2026-10-18T12:00:59.000Z",
      source: "test",
    };
    expect(quoteCoversDeadline(quote, eligible)).toBe(false);
    expect(
      quoteCoversDeadline(
        { ...quote, observedAt: "2026-10-18T12:01:00.000Z" },
        eligible,
      ),
    ).toBe(true);
  });
});

describe("isFreshQuote", () => {
  const now = Date.parse("2026-10-18T12:01:20.000Z");

  it("rejects quotes older than the max age", () => {
    expect(
      isFreshQuote(
        { price: "70000", observedAt: "2026-10-18T12:01:04.000Z", source: "test" },
        now,
        15_000,
      ),
    ).toBe(false);
  });

  it("rejects quotes too far in the future", () => {
    expect(
      isFreshQuote(
        { price: "70000", observedAt: "2026-10-18T12:01:26.000Z", source: "test" },
        now,
        15_000,
      ),
    ).toBe(false);
  });
});
