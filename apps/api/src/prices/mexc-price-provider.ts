import { parsePrice } from "../domain/money.js";
import type { MarketQuote } from "../domain/rules.js";
import { logPriceFailure, PriceProviderError } from "./price-provider.js";

export const MEXC_BTC_TRADES_URL = "https://api.mexc.com/api/v3/trades?symbol=BTCUSDT&limit=1";

export function tradeObservedAt(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs < 1_000_000_000_000) {
    throw new PriceProviderError("MEXC trade time was invalid.");
  }
  return new Date(timeMs).toISOString();
}

export function tradePrice(value: string): string {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) throw new PriceProviderError("MEXC price was invalid.");
  const price = match[2] ? `${match[1]}.${match[2].slice(0, 8)}` : match[1];
  parsePrice(price);
  return price;
}

export class MexcPriceProvider {
  constructor(
    private readonly url: string = MEXC_BTC_TRADES_URL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 8_000,
  ) {}

  async getQuote(): Promise<MarketQuote> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number | undefined;
    try {
      const response = await this.fetchImpl(this.url, {
        signal: controller.signal,
        headers: { accept: "application/json" },
      });
      status = response.status;
      if (!response.ok) {
        throw new PriceProviderError(`MEXC returned HTTP ${response.status}.`);
      }
      const body: unknown = await response.json();
      const trade = readTrade(body);
      return {
        price: tradePrice(trade.price),
        observedAt: tradeObservedAt(trade.time),
        source: "mexc:BTCUSDT",
      };
    } catch (error) {
      logPriceFailure("mexc", error, status);
      if (error instanceof PriceProviderError) throw error;
      throw new PriceProviderError("MEXC price request failed.");
    } finally {
      clearTimeout(timer);
    }
  }
}

function readTrade(value: unknown): { price: string; time: number } {
  if (!Array.isArray(value) || value.length === 0) {
    throw new PriceProviderError("MEXC payload was missing a trade.");
  }
  const trade = value[0] as { price?: unknown; time?: unknown };
  if (typeof trade?.price !== "string" || typeof trade.time !== "number") {
    throw new PriceProviderError("MEXC payload was missing a trade.");
  }
  return { price: trade.price, time: trade.time };
}
