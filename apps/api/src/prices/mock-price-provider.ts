import type { Clock } from "../domain/clock.js";
import type { MarketQuote } from "../domain/rules.js";

/**
 * Local interview helper. Each read is stamped with the server clock unless a
 * test pins the observation time. Not registered in production.
 */
export class MockPriceProvider {
  private price: string;
  pinnedObservedAt: string | null = null;

  constructor(
    initial: MarketQuote,
    private readonly clock: Clock,
  ) {
    this.price = initial.price;
  }

  async getQuote(): Promise<MarketQuote> {
    return {
      price: this.price,
      observedAt: this.pinnedObservedAt ?? new Date(this.clock.now()).toISOString(),
      source: "mock",
    };
  }

  setPrice(price: string): void {
    this.price = price;
    this.pinnedObservedAt = null;
  }
}
