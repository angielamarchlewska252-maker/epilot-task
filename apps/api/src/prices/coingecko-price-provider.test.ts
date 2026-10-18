import { describe, expect, it, vi } from "vitest";
import { CoinGeckoPriceProvider } from "./coingecko-price-provider.js";
import { PriceProviderError } from "./price-provider.js";

describe("CoinGeckoPriceProvider", () => {
  it("returns a two-decimal BTC/USD quote", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ bitcoin: { usd: 81628.129, last_updated_at: 1_792_308_641 } }),
        { status: 200 },
      ),
    );
    const provider = new CoinGeckoPriceProvider("https://example.test/price", fetchImpl);
    await expect(provider.getQuote()).resolves.toEqual({
      price: "81628.13",
      observedAt: "2026-10-18T07:30:41.000Z",
      source: "coingecko:bitcoin-usd",
    });
  });

  it("fails closed when CoinGecko is unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response("nope", { status: 429 }));
    const provider = new CoinGeckoPriceProvider("https://example.test/price", fetchImpl);
    await expect(provider.getQuote()).rejects.toBeInstanceOf(PriceProviderError);
  });
});
