import { describe, expect, it, vi } from "vitest";
import { InvalidPriceError } from "../domain/money.js";
import { CoinbasePriceProvider, normalizeTimestamp } from "./coinbase-price-provider.js";
import { PriceProviderError } from "./price-provider.js";

describe("normalizeTimestamp", () => {
  it("truncates Coinbase nanosecond timestamps to milliseconds", () => {
    expect(normalizeTimestamp("2026-09-28T19:31:56.992992141Z")).toBe(
      "2026-09-28T19:31:56.992Z",
    );
  });
});

describe("CoinbasePriceProvider", () => {
  const url = "https://api.exchange.coinbase.com/products/BTC-USD/ticker";

  it("returns a validated quote", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          price: "83587.68",
          time: "2026-09-28T19:31:56.992992141Z",
          bid: "83587.67",
          ask: "83587.68",
        }),
        { status: 200 },
      ),
    );
    const provider = new CoinbasePriceProvider(url, fetchImpl);
    await expect(provider.getQuote()).resolves.toEqual({
      price: "83587.68",
      observedAt: "2026-09-28T19:31:56.992Z",
      source: "coinbase-exchange:BTC-USD",
    });
  });

  it("fails closed on HTTP errors", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 429 }));
    const provider = new CoinbasePriceProvider(url, fetchImpl);
    await expect(provider.getQuote()).rejects.toBeInstanceOf(PriceProviderError);
  });

  it("fails closed on an invalid price", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ price: "-1", time: "2026-09-28T19:31:56.000Z" }), {
        status: 200,
      }),
    );
    const provider = new CoinbasePriceProvider(url, fetchImpl);
    await expect(provider.getQuote()).rejects.toBeInstanceOf(InvalidPriceError);
  });
});
