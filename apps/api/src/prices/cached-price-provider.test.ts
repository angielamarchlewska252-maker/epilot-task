import { describe, expect, it, vi } from "vitest";
import { ManualClock } from "../domain/clock.js";
import type { MarketQuote } from "../domain/rules.js";
import { CachedPriceProvider } from "./cached-price-provider.js";

describe("CachedPriceProvider", () => {
  it("reuses a recent quote for display", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const quote: MarketQuote = {
      price: "70000",
      observedAt: "2026-10-18T12:00:00.000Z",
      source: "test",
    };
    const getQuote = vi.fn(async () => quote);
    const provider = new CachedPriceProvider({ getQuote }, 4_000, clock);

    await provider.getQuote();
    clock.advance(1_000);
    await provider.getQuote();

    expect(getQuote).toHaveBeenCalledTimes(1);
  });

  it("fetches again for settlement when the cached trade is before the deadline", async () => {
    const clock = new ManualClock(Date.parse("2026-10-18T12:00:00.000Z"));
    const early: MarketQuote = {
      price: "70000",
      observedAt: "2026-10-18T12:00:00.000Z",
      source: "test",
    };
    const later: MarketQuote = {
      price: "70100",
      observedAt: "2026-10-18T12:01:01.000Z",
      source: "test",
    };
    const getQuote = vi.fn<() => Promise<MarketQuote>>();
    getQuote.mockResolvedValueOnce(early).mockResolvedValueOnce(later);
    const provider = new CachedPriceProvider({ getQuote }, 4_000, clock);

    await provider.getQuote();
    clock.advance(1_000);
    const settlement = await provider.getSettlementQuote(Date.parse("2026-10-18T12:01:00.000Z"));

    expect(settlement).toEqual(later);
    expect(getQuote).toHaveBeenCalledTimes(2);
  });
});
