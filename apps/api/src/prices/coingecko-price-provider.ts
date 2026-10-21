import { parsePrice } from "../domain/money.js";
import type { MarketQuote } from "../domain/rules.js";
import { logPriceFailure, PriceProviderError } from "./price-provider.js";

export const COINGECKO_BTC_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true&precision=2";

export function usdPriceString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new PriceProviderError("CoinGecko price was invalid.");
  }
  const price = value.toFixed(2);
  parsePrice(price);
  return price;
}

export class CoinGeckoPriceProvider {
  constructor(
    private readonly url: string = COINGECKO_BTC_URL,
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
        throw new PriceProviderError(`CoinGecko returned HTTP ${response.status}.`);
      }
      const body: unknown = await response.json();
      const quote = readQuote(body);
      return {
        price: usdPriceString(quote.usd),
        observedAt: new Date(quote.lastUpdatedAt * 1000).toISOString(),
        source: "coingecko:bitcoin-usd",
      };
    } catch (error) {
      logPriceFailure("coingecko", error, status);
      if (error instanceof PriceProviderError) throw error;
      throw new PriceProviderError("CoinGecko price request failed.");
    } finally {
      clearTimeout(timer);
    }
  }
}

function readQuote(value: unknown): { usd: number; lastUpdatedAt: number } {
  if (!value || typeof value !== "object") {
    throw new PriceProviderError("CoinGecko payload was not an object.");
  }
  const bitcoin = (value as { bitcoin?: { usd?: unknown; last_updated_at?: unknown } }).bitcoin;
  if (!bitcoin || typeof bitcoin.usd !== "number" || typeof bitcoin.last_updated_at !== "number") {
    throw new PriceProviderError("CoinGecko payload was missing the Bitcoin price.");
  }
  if (!Number.isFinite(bitcoin.last_updated_at)) {
    throw new PriceProviderError("CoinGecko timestamp was invalid.");
  }
  return { usd: bitcoin.usd, lastUpdatedAt: bitcoin.last_updated_at };
}
