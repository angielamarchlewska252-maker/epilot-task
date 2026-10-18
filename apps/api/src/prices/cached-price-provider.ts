import type { Clock } from "../domain/clock.js";
import type { MarketQuote } from "../domain/rules.js";
import type { MarketData } from "./price-provider.js";

/**
 * Short cache for the price display. Settlement will not reuse a trade
 * that printed before the guess deadline.
 */
export class CachedPriceProvider implements MarketData {
  private cached: { quote: MarketQuote; fetchedAt: number } | null = null;

  constructor(
    private readonly inner: { getQuote(): Promise<MarketQuote> },
    private readonly ttlMs: number,
    private readonly clock: Clock,
  ) {}

  async getQuote(): Promise<MarketQuote> {
    const now = this.clock.now();
    if (this.cached && now - this.cached.fetchedAt < this.ttlMs) {
      return this.cached.quote;
    }
    try {
      return await this.refresh();
    } catch (error) {
      if (this.cached) return this.cached.quote;
      throw error;
    }
  }

  async getSettlementQuote(eligibleAtMs: number): Promise<MarketQuote> {
    const now = this.clock.now();
    if (
      this.cached &&
      now - this.cached.fetchedAt < this.ttlMs &&
      Date.parse(this.cached.quote.observedAt) >= eligibleAtMs
    ) {
      return this.cached.quote;
    }
    try {
      return await this.refresh();
    } catch (error) {
      if (this.cached && Date.parse(this.cached.quote.observedAt) >= eligibleAtMs) {
        return this.cached.quote;
      }
      throw error;
    }
  }

  invalidate(): void {
    this.cached = null;
  }

  private async refresh(): Promise<MarketQuote> {
    const quote = await this.inner.getQuote();
    this.cached = { quote, fetchedAt: this.clock.now() };
    return quote;
  }
}
