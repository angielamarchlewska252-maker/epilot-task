import type { MarketQuote } from "../domain/rules.js";

export interface MarketData {
  getQuote(): Promise<MarketQuote>;
  getSettlementQuote(eligibleAtMs: number): Promise<MarketQuote>;
}

export class PriceProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PriceProviderError";
  }
}
