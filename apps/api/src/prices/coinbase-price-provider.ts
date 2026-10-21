import { InvalidPriceError, parsePrice } from "../domain/money.js";
import type { MarketQuote } from "../domain/rules.js";
import { logPriceFailure, PriceProviderError } from "./price-provider.js";

export const COINBASE_USER_AGENT = "epilot-btc-arena";

const tickerSchema = {
  parse(value: unknown): { price: string; time: string } {
    if (!value || typeof value !== "object") {
      throw new PriceProviderError("Ticker payload was not an object.");
    }
    const record = value as Record<string, unknown>;
    if (typeof record.price !== "string" || typeof record.time !== "string") {
      throw new PriceProviderError("Ticker payload was missing price or time.");
    }
    return { price: record.price, time: record.time };
  },
};

export function normalizeTimestamp(value: string): string {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match) {
    throw new PriceProviderError("Ticker time was not ISO 8601.");
  }
  const fraction = (match[2] ?? "000").slice(0, 3).padEnd(3, "0");
  const iso = `${match[1]}.${fraction}${match[3]}`;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    throw new PriceProviderError("Ticker time could not be parsed.");
  }
  return new Date(parsed).toISOString();
}

export class CoinbasePriceProvider {
  constructor(
    private readonly url: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 4_000,
  ) {}

  async getQuote(): Promise<MarketQuote> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number | undefined;
    try {
      const response = await this.fetchImpl(this.url, {
        signal: controller.signal,
        headers: { accept: "application/json", "user-agent": COINBASE_USER_AGENT },
      });
      status = response.status;
      if (!response.ok) {
        throw new PriceProviderError(`Coinbase returned HTTP ${response.status}.`);
      }
      const body: unknown = await response.json();
      const ticker = tickerSchema.parse(body);
      parsePrice(ticker.price);
      return {
        price: ticker.price,
        observedAt: normalizeTimestamp(ticker.time),
        source: "coinbase-exchange:BTC-USD",
      };
    } catch (error) {
      logPriceFailure("coinbase", error, status);
      if (error instanceof PriceProviderError || error instanceof InvalidPriceError) throw error;
      throw new PriceProviderError("Coinbase ticker request failed.");
    } finally {
      clearTimeout(timer);
    }
  }
}
