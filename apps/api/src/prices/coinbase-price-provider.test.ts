import { describe, expect, it, vi } from "vitest";
import { InvalidPriceError } from "../domain/money.js";
import {
  COINBASE_USER_AGENT,
  CoinbasePriceProvider,
  normalizeTimestamp,
} from "./coinbase-price-provider.js";

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
    expect(fetchImpl).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        headers: { accept: "application/json", "user-agent": COINBASE_USER_AGENT },
      }),
    );
  });

  it("logs the HTTP status and keeps the response body out of the error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>blocked</html>", { status: 403 }),
    );
    const provider = new CoinbasePriceProvider(url, fetchImpl);
    await expect(provider.getQuote()).rejects.toThrow("Coinbase returned HTTP 403.");
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(logged).toContain('"event":"price_provider_failed"');
    expect(logged).toContain('"provider":"coinbase"');
    expect(logged).toContain('"status":403');
    expect(logged).not.toContain("blocked");
    errorSpy.mockRestore();
  });

  it("fails closed when the ticker has no trade time", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ price: "83587.68" }), { status: 200 }),
    );
    const provider = new CoinbasePriceProvider(url, fetchImpl);
    await expect(provider.getQuote()).rejects.toThrow("Ticker payload was missing price or time.");
    errorSpy.mockRestore();
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
