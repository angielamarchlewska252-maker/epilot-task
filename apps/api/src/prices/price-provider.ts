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

/** Server log only. The public API keeps the generic 503 message. */
export function logPriceFailure(provider: string, error: unknown, status?: number): void {
  console.error(
    JSON.stringify({
      event: "price_provider_failed",
      provider,
      status: status ?? null,
      message: error instanceof Error ? error.message : "Price request failed.",
    }),
  );
}
