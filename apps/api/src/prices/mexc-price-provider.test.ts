import { describe, expect, it, vi } from "vitest";
import { MexcPriceProvider, tradeObservedAt, tradePrice } from "./mexc-price-provider.js";
import { PriceProviderError } from "./price-provider.js";

const tradeTime = 1_792_568_565_619;

describe("MexcPriceProvider", () => {
  it("reads the latest BTC trade and its timestamp", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          { price: "83021.529999999", time: tradeTime, qty: "0.001" },
          { price: "1.00", time: tradeTime - 1_000 },
        ]),
        { status: 200 },
      ),
    );
    const provider = new MexcPriceProvider("https://example.test/trades", fetchImpl);
    await expect(provider.getQuote()).resolves.toEqual({
      price: "83021.52999999",
      observedAt: "2026-10-21T07:42:45.619Z",
      source: "mexc:BTCUSDT",
    });
    expect(tradePrice("83021.52")).toBe("83021.52");
    expect(tradeObservedAt(tradeTime)).toBe("2026-10-21T07:42:45.619Z");
  });

  it("logs the HTTP status and keeps the response body out of the error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("<html>blocked</html>", { status: 403 }),
    );
    const provider = new MexcPriceProvider("https://example.test/trades", fetchImpl);
    await expect(provider.getQuote()).rejects.toThrow("MEXC returned HTTP 403.");
    const logged = String(errorSpy.mock.calls[0]?.[0]);
    expect(logged).toContain("\"event\":\"price_provider_failed\"");
    expect(logged).toContain("\"provider\":\"mexc\"");
    expect(logged).toContain("\"status\":403");
    expect(logged).not.toContain("blocked");
    errorSpy.mockRestore();
  });

  it("fails closed when the trade list or timestamp is unusable", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const empty = new MexcPriceProvider(
      "https://example.test/trades",
      vi.fn<typeof fetch>().mockResolvedValue(new Response("[]", { status: 200 })),
    );
    await expect(empty.getQuote()).rejects.toBeInstanceOf(PriceProviderError);

    const staleShape = new MexcPriceProvider(
      "https://example.test/trades",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify([{ price: "83021.52", time: 1_700_000_000 }]), { status: 200 }),
      ),
    );
    await expect(staleShape.getQuote()).rejects.toThrow("MEXC trade time was invalid.");

    const down = new MexcPriceProvider(
      "https://example.test/trades",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("connect")),
    );
    await expect(down.getQuote()).rejects.toThrow("MEXC price request failed.");
    errorSpy.mockRestore();
  });
});
